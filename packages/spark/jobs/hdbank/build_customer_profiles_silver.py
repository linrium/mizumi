from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql import functions as F
from pyspark.sql import types as T

SOURCE_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_customer_events_v1"
)
TARGET_PATH = "s3a://unitycatalog/hdbank/hdbank_payments_prod_silver/customers_v1"

RAW_EVENT_SCHEMA = T.StructType(
    [
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("customer_name", T.StringType(), True),
        T.StructField("segment_name", T.StringType(), True),
        T.StructField("kyc_status", T.StringType(), True),
        T.StructField("preferred_channel", T.StringType(), True),
        T.StructField("updated_at", T.TimestampType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("hdbank-build-customer-profiles-silver")
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

        bronze_df = spark.read.format("delta").load(SOURCE_PATH)
        parsed_df = bronze_df.select(
            F.col("timestamp").alias("event_timestamp"),
            F.from_json(F.col("value"), RAW_EVENT_SCHEMA).alias("event"),
        )

        candidate_df = (
            parsed_df.select(
                F.col("event.customer_id").cast("string").alias("customer_id"),
                F.trim(F.col("event.customer_name")).alias("customer_name"),
                F.upper(F.col("event.segment_name")).alias("segment_name"),
                F.upper(F.col("event.kyc_status")).alias("kyc_status"),
                F.upper(F.col("event.preferred_channel")).alias("preferred_channel"),
                F.coalesce(F.col("event.updated_at"), F.col("event_timestamp")).alias("updated_at"),
            )
            .where(F.col("customer_id").isNotNull())
            .where(F.col("updated_at").isNotNull())
        )

        latest_window = Window.partitionBy("customer_id").orderBy(F.desc("updated_at"))
        silver_df = (
            candidate_df.withColumn("row_num", F.row_number().over(latest_window))
            .where(F.col("row_num") == 1)
            .drop("row_num")
        )

        silver_df.write.format("delta").mode("overwrite").save(TARGET_PATH)

        bronze_count = bronze_df.count()
        silver_count = silver_df.count()
        spark.stop()

        pipes.report_asset_materialization(
            metadata={
                "bronze_rows": bronze_count,
                "silver_rows": silver_count,
                "source": SOURCE_PATH,
                "target": TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
