import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

CHECKPOINT_PATH = os.getenv(
    "BRONZE_CHECKPOINT_PATH",
    "s3a://unitycatalog/vietjetair/checkpoints/vietjetair_bookings_prod_bronze/raw_flight_events_v1",
)
TARGET_PATH = os.getenv(
    "BRONZE_TARGET_PATH",
    "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_flight_events_v1",
)
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "redpanda-svc.redpanda.svc.cluster.local:9092",
)
KAFKA_TOPIC = os.getenv(
    "KAFKA_TOPIC",
    "vietjetair.vietjetair_bookings_prod_bronze.raw_flight_events_v1",
)
STARTING_OFFSETS = os.getenv("KAFKA_STARTING_OFFSETS", "latest")


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("vietjetair-stream-raw-flight-events-to-bronze")
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

    raw_events = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", STARTING_OFFSETS)
        .option("failOnDataLoss", "false")
        .load()
        .select(
            F.col("timestamp"),
            F.col("key").cast("string").alias("key"),
            F.col("value").cast("string").alias("value"),
        )
        .where(F.col("value").isNotNull())
    )

    query = (
        raw_events.writeStream.format("delta")
        .option("checkpointLocation", CHECKPOINT_PATH)
        .option("path", TARGET_PATH)
        .outputMode("append")
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
