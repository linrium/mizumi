from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql import functions as F
from pyspark.sql import types as T

BRONZE_CUSTOMERS_SOURCE_PATH = "s3a://unitycatalog/hdbank/hdbank_partnership_prod_bronze/customers_v1"
BRONZE_PARTNER_EVENTS_SOURCE_PATH = "s3a://unitycatalog/hdbank/hdbank_partnership_prod_bronze/partner_events_v1"
CUSTOMERS_TARGET_PATH = "s3a://unitycatalog/hdbank/hdbank_partnership_prod_silver/customers_v1"
TRAVEL_FEATURES_TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_silver/travel_spend_features_v1"
)

PAYMENT_SCHEMA = T.StructType(
    [
        T.StructField("event_type", T.StringType(), True),
        T.StructField("payment_event_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("account_id", T.StringType(), True),
        T.StructField("transaction_reference", T.StringType(), True),
        T.StructField("merchant_name", T.StringType(), True),
        T.StructField("merchant_category", T.StringType(), True),
        T.StructField("amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("payment_timestamp", T.StringType(), True),
        T.StructField("note", T.StringType(), True),
        T.StructField("shared_customer", T.BooleanType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("hdbank-build-silver")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )


def main() -> None:
    spark = build_session()

    bronze_customers_df = spark.read.format("delta").load(BRONZE_CUSTOMERS_SOURCE_PATH)
    bronze_events_df = spark.read.format("delta").load(BRONZE_PARTNER_EVENTS_SOURCE_PATH)

    customer_events = (
        bronze_customers_df.where(F.col("customer_id").isNotNull())
        .select(
            F.col("customer_id"),
            F.col("customer_name"),
            F.upper(F.col("segment_name")).alias("segment_name"),
            F.lit("VERIFIED").alias("kyc_status"),
            F.upper(F.col("preferred_channel")).alias("preferred_channel"),
            F.col("monthly_income"),
            F.col("credit_score"),
            F.col("has_credit_card"),
            F.col("shared_customer"),
            F.col("seed_timestamp").alias("updated_at"),
        )
    )

    latest_window = Window.partitionBy("customer_id").orderBy(F.desc("updated_at"))
    customers_df = (
        customer_events.withColumn("row_num", F.row_number().over(latest_window))
        .where(F.col("row_num") == 1)
        .drop("row_num")
    )

    payment_events = (
        bronze_events_df.where(F.col("event_type") == "card_transaction_posted")
        .withColumn("payload", F.from_json(F.col("value"), PAYMENT_SCHEMA))
        .select(
            F.col("payload.payment_event_id").alias("payment_event_id"),
            F.col("payload.customer_id").alias("customer_id"),
            F.upper(F.col("payload.account_id")).alias("account_id"),
            F.upper(F.col("payload.merchant_name")).alias("merchant_name"),
            F.upper(F.col("payload.merchant_category")).alias("merchant_category"),
            F.col("payload.amount").alias("amount"),
            F.upper(F.col("payload.currency")).alias("currency"),
            F.to_timestamp(F.col("payload.payment_timestamp")).alias("payment_timestamp"),
            F.col("payload.shared_customer").alias("shared_customer"),
        )
    )

    travel_features_df = (
        payment_events.groupby("customer_id")
        .agg(
            F.count("*").cast("int").alias("transaction_count"),
            F.round(F.sum("amount"), 2).alias("total_card_spend"),
            F.round(
                F.sum(F.when(F.col("merchant_category").isin("AIRLINE", "TRAVEL", "HOTEL"), F.col("amount")).otherwise(F.lit(0.0))),
                2,
            ).alias("travel_spend"),
            F.max(F.when(F.col("merchant_name") == "VIETJETAIR", F.lit(1)).otherwise(F.lit(0))).alias("has_vietjet_spend"),
            F.max("payment_timestamp").alias("last_payment_at"),
        )
        .withColumn(
            "travel_affinity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.lit(0.2)
                    + (F.col("travel_spend") / F.lit(20_000_000.0))
                    + F.when(F.col("has_vietjet_spend") == 1, F.lit(0.15)).otherwise(F.lit(0.0)),
                ),
                2,
            ),
        )
    )

    customers_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(CUSTOMERS_TARGET_PATH)
    travel_features_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        TRAVEL_FEATURES_TARGET_PATH
    )

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="hdbank_silver_customers",
            metadata={"row_count": customers_df.count(), "target": CUSTOMERS_TARGET_PATH},
        )
        pipes.report_asset_materialization(
            asset_key="hdbank_silver_travel_spend_features",
            metadata={"row_count": travel_features_df.count(), "target": TRAVEL_FEATURES_TARGET_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
