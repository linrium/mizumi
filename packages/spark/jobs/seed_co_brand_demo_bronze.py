from __future__ import annotations

from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

LOCAL_CUSTOMER_MASTER_PATH = "/opt/spark/jobs/data/co_brand_customers.csv"
RUSTFS_CUSTOMER_MASTER_PATH = "s3a://unitycatalog/reference/co_brand_customers_csv"
HDBANK_BRONZE_TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_bronze/partner_events_v1"
)
VIETJETAIR_BRONZE_TARGET_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/partner_events_v1"
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("seed-co-brand-demo-bronze")
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

    local_customer_master_df = (
        spark.read.option("header", "true")
        .option("inferSchema", "true")
        .csv(LOCAL_CUSTOMER_MASTER_PATH)
    )

    local_customer_master_df.coalesce(1).write.mode("overwrite").option("header", "true").csv(
        RUSTFS_CUSTOMER_MASTER_PATH
    )

    customer_master_df = (
        spark.read.option("header", "true")
        .option("inferSchema", "true")
        .csv(RUSTFS_CUSTOMER_MASTER_PATH)
    )

    customer_master_df = customer_master_df.withColumn(
        "seed_timestamp",
        F.current_timestamp(),
    )

    hdbank_events_df = (
        customer_master_df.where(F.col("has_hdbank") == True)
        .select(
            F.col("seed_timestamp").alias("timestamp"),
            F.col("hdbank_customer_id").alias("key"),
            F.lit("customer_profile_updated").alias("event_type"),
            F.to_json(
                F.struct(
                    F.lit("customer_profile_updated").alias("event_type"),
                    F.col("hdbank_customer_id").alias("customer_id"),
                    F.col("full_name").alias("customer_name"),
                    F.col("hdbank_segment").alias("segment_name"),
                    F.lit("VERIFIED").alias("kyc_status"),
                    F.col("preferred_channel"),
                    F.col("monthly_income"),
                    F.col("credit_score"),
                    F.col("has_credit_card"),
                    F.col("shared_customer"),
                    F.col("seed_timestamp").cast("string").alias("updated_at"),
                )
            ).alias("value"),
        )
    )

    vietjetair_events_df = (
        customer_master_df.where(F.col("has_vietjetair") == True)
        .select(
            F.col("seed_timestamp").alias("timestamp"),
            F.col("vietjetair_customer_id").alias("key"),
            F.lit("customer_profile_updated").alias("event_type"),
            F.to_json(
                F.struct(
                    F.lit("customer_profile_updated").alias("event_type"),
                    F.col("vietjetair_customer_id").alias("customer_id"),
                    F.col("full_name").alias("customer_name"),
                    F.col("membership_tier"),
                    F.col("home_airport"),
                    F.col("email_opt_in"),
                    F.col("shared_customer"),
                    F.col("seed_timestamp").cast("string").alias("updated_at"),
                )
            ).alias("value"),
        )
    )

    hdbank_events_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        HDBANK_BRONZE_TARGET_PATH
    )
    vietjetair_events_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        VIETJETAIR_BRONZE_TARGET_PATH
    )

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="hdbank_bronze_partner_events",
            metadata={
                "row_count": hdbank_events_df.count(),
                "customer_master_rows": customer_master_df.count(),
                "customer_master_export": RUSTFS_CUSTOMER_MASTER_PATH,
                "target": HDBANK_BRONZE_TARGET_PATH,
            },
        )
        pipes.report_asset_materialization(
            asset_key="vietjetair_bronze_partner_events",
            metadata={
                "row_count": vietjetair_events_df.count(),
                "customer_master_rows": customer_master_df.count(),
                "customer_master_export": RUSTFS_CUSTOMER_MASTER_PATH,
                "target": VIETJETAIR_BRONZE_TARGET_PATH,
            },
        )

    spark.stop()


if __name__ == "__main__":
    main()
