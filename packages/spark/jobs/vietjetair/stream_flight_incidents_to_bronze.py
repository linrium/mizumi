from __future__ import annotations

import os
import sys
from pathlib import Path

from pyspark.sql import functions as F
from pyspark.sql import types as T

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import VIETJETAIR_BRONZE_INCIDENTS_PATH, build_session

CHECKPOINT_PATH = os.getenv(
    "BRONZE_CHECKPOINT_PATH",
    "s3a://unitycatalog/vietjetair/checkpoints/vietjetair_partnership_prod_bronze/flight_incidents_v1",
)
TARGET_PATH = os.getenv("BRONZE_TARGET_PATH", VIETJETAIR_BRONZE_INCIDENTS_PATH)
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "redpanda-svc.redpanda.svc.cluster.local:9092",
)
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "vietjetair.partner_events_v1")
STARTING_OFFSETS = os.getenv("KAFKA_STARTING_OFFSETS", "latest")

INCIDENT_SCHEMA = T.StructType(
    [
        T.StructField("event_type", T.StringType(), True),
        T.StructField("report_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("ticket_id", T.StringType(), True),
        T.StructField("booking_reference", T.StringType(), True),
        T.StructField("airline", T.StringType(), True),
        T.StructField("report_channel", T.StringType(), True),
        T.StructField("incident_type", T.StringType(), True),
        T.StructField("severity", T.StringType(), True),
        T.StructField("issue_airport", T.StringType(), True),
        T.StructField("origin_airport", T.StringType(), True),
        T.StructField("destination_airport", T.StringType(), True),
        T.StructField("flight_number", T.StringType(), True),
        T.StructField("departure_date", T.StringType(), True),
        T.StructField("reported_at", T.StringType(), True),
        T.StructField("status", T.StringType(), True),
        T.StructField("baggage_tag", T.StringType(), True),
        T.StructField("delayed_minutes", T.IntegerType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("city", T.StringType(), True),
        T.StructField("image_path", T.StringType(), True),
    ]
)


def main() -> None:
    spark = build_session("vietjetair-stream-flight-incidents-to-bronze")

    raw_events = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", STARTING_OFFSETS)
        .option("failOnDataLoss", "false")
        .load()
        .select(F.col("value").cast("string").alias("value"))
        .where(F.col("value").isNotNull())
        .withColumn("payload", F.from_json("value", INCIDENT_SCHEMA))
        .select("payload.*")
        .where(F.col("event_type") == F.lit("flight_incident_reported"))
        .select(
            "report_id",
            "customer_id",
            "ticket_id",
            "booking_reference",
            F.coalesce(F.col("airline"), F.lit("Vietjet Air")).alias("airline"),
            F.coalesce(F.col("report_channel"), F.lit("vietjetair_app")).alias("report_channel"),
            "incident_type",
            "severity",
            "issue_airport",
            "origin_airport",
            "destination_airport",
            "flight_number",
            F.to_timestamp("departure_date").alias("departure_date"),
            F.to_timestamp("reported_at").alias("reported_at"),
            "status",
            "baggage_tag",
            F.coalesce(F.col("delayed_minutes"), F.lit(0)).alias("delayed_minutes"),
            F.coalesce(F.col("currency"), F.lit("VND")).alias("currency"),
            "city",
            "image_path",
        )
        .withColumn("has_image", F.col("image_path").isNotNull() & (F.length("image_path") > 0))
        .withColumn("seed_timestamp", F.current_timestamp())
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
