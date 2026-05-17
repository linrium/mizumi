from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql import functions as F

PAYMENT_EVENTS_SOURCE_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_silver/card_payment_events_v1"
)
CUSTOMERS_SOURCE_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_silver/customers_v1"
)
RISK_TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_gold/payment_risk_events_v1"
)
MERCHANT_TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_gold/merchant_revenue_v1"
)
USER_SPEND_TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_gold/user_spend_v1"
)
RISK_MODEL_VERSION = "spark-gold-v1"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("hdbank-build-payment-analytics-gold")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )


def main() -> None:
    with open_dagster_pipes() as pipes:
        spark = build_session()

        payment_events_df = (
            spark.read.format("delta")
            .load(PAYMENT_EVENTS_SOURCE_PATH)
            .withColumn("business_date", F.to_date("payment_timestamp"))
        )
        customer_profiles_df = spark.read.format("delta").load(CUSTOMERS_SOURCE_PATH)

        merchant_revenue_df = (
            payment_events_df.groupBy(
                "business_date",
                "merchant_name",
                "merchant_category",
                "currency",
            )
            .agg(
                F.count("*").cast("int").alias("transaction_count"),
                F.round(F.sum("amount"), 2).alias("gross_payment_volume"),
            )
            .withColumn(
                "fee_revenue",
                F.round(F.col("gross_payment_volume") * F.lit(0.015), 2),
            )
        )

        category_window = Window.partitionBy(
            "business_date", "customer_id", "account_id", "currency"
        ).orderBy(F.desc("category_tx_count"), F.asc("merchant_category"))
        top_categories_df = (
            payment_events_df.groupBy(
                "business_date",
                "customer_id",
                "account_id",
                "currency",
                "merchant_category",
            )
            .agg(F.count("*").alias("category_tx_count"))
            .withColumn("row_num", F.row_number().over(category_window))
            .where(F.col("row_num") == 1)
            .select(
                "business_date",
                "customer_id",
                "account_id",
                "currency",
                F.col("merchant_category").alias("top_merchant_category"),
            )
        )

        user_spend_df = (
            payment_events_df.groupBy(
                "business_date",
                "customer_id",
                "account_id",
                "currency",
            )
            .agg(
                F.count("*").cast("int").alias("transaction_count"),
                F.round(F.sum("amount"), 2).alias("total_spend"),
                F.round(F.avg("amount"), 2).alias("avg_ticket_size"),
            )
            .join(
                top_categories_df,
                on=["business_date", "customer_id", "account_id", "currency"],
                how="left",
            )
        )

        note_signal = (
            F.when(
                F.lower(F.coalesce(F.col("note"), F.lit(""))).rlike(
                    "urgent|crypto|gift card|casino|wire|refund"
                ),
                F.lit("flagged_keywords"),
            ).otherwise(F.lit("clear"))
        )
        customer_segment_multiplier = (
            F.when(F.col("segment_name") == "HIGH_NET_WORTH", F.lit(0.1))
            .when(F.col("segment_name") == "SME", F.lit(0.05))
            .otherwise(F.lit(0.0))
        )
        risk_detection_df = (
            payment_events_df.alias("payments")
            .join(customer_profiles_df.alias("customers"), on="customer_id", how="left")
            .select(
                F.col("payments.business_date").alias("detection_date"),
                F.col("payments.payment_event_id").alias("payment_event_id"),
                F.col("payments.customer_id").alias("customer_id"),
                F.col("payments.account_id").alias("account_id"),
                (
                    F.when(F.col("payments.amount") >= 5000, F.lit(0.9))
                    .when(F.col("payments.amount") >= 2500, F.lit(0.7))
                    .when(note_signal == "flagged_keywords", F.lit(0.75))
                    .otherwise(F.lit(0.2))
                    + customer_segment_multiplier
                ).alias("risk_score_raw"),
                note_signal.alias("note_signal"),
            )
            .withColumn("risk_score", F.round(F.least(F.col("risk_score_raw"), F.lit(0.99)), 2))
            .drop("risk_score_raw")
            .withColumn(
                "risk_label",
                F.when(F.col("risk_score") >= 0.8, F.lit("high"))
                .when(F.col("risk_score") >= 0.5, F.lit("medium"))
                .otherwise(F.lit("low")),
            )
            .withColumn("model_version", F.lit(RISK_MODEL_VERSION))
        )

        merchant_revenue_df.write.format("delta").mode("overwrite").save(
            MERCHANT_TARGET_PATH
        )
        user_spend_df.write.format("delta").mode("overwrite").save(
            USER_SPEND_TARGET_PATH
        )
        risk_detection_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
            RISK_TARGET_PATH
        )

        payment_event_rows = payment_events_df.count()
        customer_profile_rows = customer_profiles_df.count()
        merchant_rows = merchant_revenue_df.count()
        user_spend_rows = user_spend_df.count()
        risk_rows = risk_detection_df.count()
        spark.stop()

        # pipes.report_asset_materialization(
        #     asset_key="banking_gold_risk_detection",
        #     metadata={
        #         "payment_event_rows": payment_event_rows,
        #         "customer_profile_rows": customer_profile_rows,
        #         "risk_rows": risk_rows,
        #     },
        # )
        # pipes.report_asset_materialization(
        #     asset_key="banking_gold_merchant_revenue",
        #     metadata={"merchant_rows": merchant_rows},
        # )
        # pipes.report_asset_materialization(
        #     asset_key="banking_gold_user_spend",
        #     metadata={"user_spend_rows": user_spend_rows},
        # )


if __name__ == "__main__":
    main()
