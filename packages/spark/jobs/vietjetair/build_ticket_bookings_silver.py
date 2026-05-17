from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

SOURCE_PATH = "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_booking_events_v1"
TARGET_PATH = "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/ticket_bookings_v1"

RAW_EVENT_SCHEMA = T.StructType(
    [
        T.StructField("booking_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("pnr_code", T.StringType(), True),
        T.StructField("payment_reference", T.StringType(), True),
        T.StructField("route_code", T.StringType(), True),
        T.StructField("ticket_amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("booking_timestamp", T.TimestampType(), True),
        T.StructField("status", T.StringType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("vietjetair-build-ticket-bookings-silver")
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

        silver_df = (
            parsed_df.select(
                F.col("event.booking_id").cast("string").alias("booking_id"),
                F.col("event.customer_id").cast("string").alias("customer_id"),
                F.upper(F.col("event.pnr_code")).alias("pnr_code"),
                F.col("event.payment_reference").alias("payment_reference"),
                F.upper(F.col("event.route_code")).alias("route_code"),
                F.round(F.col("event.ticket_amount").cast("double"), 2).alias("ticket_amount"),
                F.upper(F.col("event.currency")).alias("currency"),
                F.coalesce(
                    F.col("event.booking_timestamp"), F.col("event_timestamp")
                ).alias("booking_timestamp"),
                F.upper(F.coalesce(F.col("event.status"), F.lit("CONFIRMED"))).alias("status"),
            )
            .where(F.col("booking_id").isNotNull())
            .where(F.col("customer_id").isNotNull())
            .where(F.col("route_code").isNotNull())
            .where(F.col("ticket_amount").isNotNull())
            .where(F.col("ticket_amount") > 0)
            .where(F.col("booking_timestamp").isNotNull())
            .where(F.col("status").isin("CONFIRMED", "TICKETED"))
            .dropDuplicates(["booking_id"])
            .drop("status")
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
