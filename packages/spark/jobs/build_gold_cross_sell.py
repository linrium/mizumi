from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

HDBANK_CUSTOMERS_PATH = "s3a://unitycatalog/hdbank/hdbank_partnership_prod_silver/customers_v1"
HDBANK_TRAVEL_FEATURES_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_silver/travel_spend_features_v1"
)
VIETJETAIR_CUSTOMERS_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/customers_v1"
VIETJETAIR_BOOKING_FEATURES_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/booking_features_v1"
)

HDBANK_GOLD_TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_gold/vietjet_activation_candidates_v1"
)
VIETJETAIR_GOLD_TARGET_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_gold/hdbank_finance_candidates_v1"
)
PARTNERSHIP_GOLD_TARGET_PATH = (
    "s3a://unitycatalog/partnership/co_brand_gold/co_brand_offer_audience_v1"
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("build-gold-cross-sell")
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

    hdbank_customers = spark.read.format("delta").load(HDBANK_CUSTOMERS_PATH)
    hdbank_travel = spark.read.format("delta").load(HDBANK_TRAVEL_FEATURES_PATH)
    vietjet_customers = spark.read.format("delta").load(VIETJETAIR_CUSTOMERS_PATH)
    vietjet_bookings = spark.read.format("delta").load(VIETJETAIR_BOOKING_FEATURES_PATH)

    hdbank_to_vietjet = (
        hdbank_customers.alias("hc")
        .join(hdbank_travel.alias("ht"), on="customer_id", how="inner")
        .join(
            vietjet_customers.select("customer_id").withColumnRenamed("customer_id", "vietjet_customer_id"),
            F.col("hc.customer_id") == F.col("vietjet_customer_id"),
            how="left",
        )
        .where(F.col("vietjet_customer_id").isNull())
        .withColumn(
            "offer_name",
            F.lit("vietjet_weekend_bundle"),
        )
        .withColumn(
            "use_case",
            F.lit("HDBank travel-affinity customer without VietJet relationship"),
        )
        .withColumn(
            "propensity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.col("ht.travel_affinity_score")
                    + (F.col("hc.monthly_income") / F.lit(180_000_000.0))
                    + F.when(F.col("hc.has_credit_card"), F.lit(0.08)).otherwise(F.lit(0.0)),
                ),
                2,
            ),
        )
        .withColumn(
            "recommended_channel",
            F.when(F.col("hc.preferred_channel") == "APP", F.lit("hdbank_app")).otherwise(F.lit("sms")),
        )
        .select(
            F.col("hc.customer_id").alias("customer_id"),
            F.col("hc.customer_name").alias("customer_name"),
            "offer_name",
            "use_case",
            "propensity_score",
            "recommended_channel",
            F.col("ht.travel_spend").alias("signal_value"),
        )
    )

    vietjet_to_hdbank = (
        vietjet_customers.alias("vc")
        .join(vietjet_bookings.alias("vb"), on="customer_id", how="inner")
        .join(
            hdbank_customers.select("customer_id").withColumnRenamed("customer_id", "hdbank_customer_id"),
            F.col("vc.customer_id") == F.col("hdbank_customer_id"),
            how="left",
        )
        .where(F.col("hdbank_customer_id").isNull())
        .withColumn(
            "offer_name",
            F.lit("hdbank_travel_now_pay_later"),
        )
        .withColumn(
            "use_case",
            F.lit("VietJet frequent flyer without HDBank financing product"),
        )
        .withColumn(
            "propensity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.col("vb.frequent_flyer_score")
                    + F.when(F.col("vc.email_opt_in"), F.lit(0.08)).otherwise(F.lit(0.0)),
                ),
                2,
            ),
        )
        .withColumn(
            "recommended_channel",
            F.when(F.col("vc.email_opt_in"), F.lit("email")).otherwise(F.lit("vietjet_app")),
        )
        .select(
            F.col("vc.customer_id").alias("customer_id"),
            F.col("vc.customer_name").alias("customer_name"),
            "offer_name",
            "use_case",
            "propensity_score",
            "recommended_channel",
            F.col("vb.gross_booking_value").alias("signal_value"),
        )
    )

    audience_df = (
        hdbank_to_vietjet.withColumn("source_company", F.lit("hdbank"))
        .withColumn("target_company", F.lit("vietjetair"))
        .unionByName(
            vietjet_to_hdbank.withColumn("source_company", F.lit("vietjetair")).withColumn(
                "target_company", F.lit("hdbank")
            )
        )
        .withColumn(
            "priority_band",
            F.when(F.col("propensity_score") >= 0.8, F.lit("high"))
            .when(F.col("propensity_score") >= 0.6, F.lit("medium"))
            .otherwise(F.lit("nurture")),
        )
    )

    hdbank_to_vietjet.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        HDBANK_GOLD_TARGET_PATH
    )
    vietjet_to_hdbank.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        VIETJETAIR_GOLD_TARGET_PATH
    )
    audience_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        PARTNERSHIP_GOLD_TARGET_PATH
    )

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="hdbank_gold_vietjet_activation_candidates",
            metadata={"row_count": hdbank_to_vietjet.count(), "target": HDBANK_GOLD_TARGET_PATH},
        )
        pipes.report_asset_materialization(
            asset_key="vietjetair_gold_hdbank_finance_candidates",
            metadata={"row_count": vietjet_to_hdbank.count(), "target": VIETJETAIR_GOLD_TARGET_PATH},
        )
        pipes.report_asset_materialization(
            asset_key="partnership_gold_co_brand_offer_audience",
            metadata={"row_count": audience_df.count(), "target": PARTNERSHIP_GOLD_TARGET_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
