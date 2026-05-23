from __future__ import annotations

import os
import sys
from pathlib import Path

from pyspark.sql import functions as F
from pyspark.sql import types as T

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import VIETJETAIR_BRONZE_TICKETS_PATH, build_session

CHECKPOINT_PATH = os.getenv(
    "BRONZE_CHECKPOINT_PATH",
    "s3a://unitycatalog/vietjetair/checkpoints/vietjetair_partnership_prod_bronze/flight_tickets_v1",
)
TARGET_PATH = os.getenv("BRONZE_TARGET_PATH", VIETJETAIR_BRONZE_TICKETS_PATH)
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "redpanda-svc.redpanda.svc.cluster.local:9092",
)
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "vietjetair.partner_events_v1")
STARTING_OFFSETS = os.getenv("KAFKA_STARTING_OFFSETS", "latest")

TICKET_SCHEMA = T.StructType(
    [
        T.StructField("event_type", T.StringType(), True),
        T.StructField("ticket_id", T.StringType(), True),
        T.StructField("booking_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("booking_reference", T.StringType(), True),
        T.StructField("pnr_code", T.StringType(), True),
        T.StructField("airline", T.StringType(), True),
        T.StructField("flight_number", T.StringType(), True),
        T.StructField("trip_type", T.StringType(), True),
        T.StructField("origin_airport", T.StringType(), True),
        T.StructField("destination_airport", T.StringType(), True),
        T.StructField("booking_at", T.StringType(), True),
        T.StructField("booking_timestamp", T.StringType(), True),
        T.StructField("departure_at", T.StringType(), True),
        T.StructField("return_departure_at", T.StringType(), True),
        T.StructField("cabin_class", T.StringType(), True),
        T.StructField("passenger_count", T.IntegerType(), True),
        T.StructField("distance_km", T.IntegerType(), True),
        T.StructField("flight_duration_minutes", T.IntegerType(), True),
        T.StructField("base_fare", T.DoubleType(), True),
        T.StructField("taxes", T.DoubleType(), True),
        T.StructField("total_price", T.DoubleType(), True),
        T.StructField("ticket_amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("baggage_kg", T.IntegerType(), True),
        T.StructField("status", T.StringType(), True),
        T.StructField("city", T.StringType(), True),
    ]
)


def main() -> None:
    spark = build_session("vietjetair-stream-flight-tickets-to-bronze")

    raw_events = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", STARTING_OFFSETS)
        .option("failOnDataLoss", "false")
        .load()
        .select(F.col("value").cast("string").alias("value"))
        .where(F.col("value").isNotNull())
        .withColumn("payload", F.from_json("value", TICKET_SCHEMA))
        .select("payload.*")
        .where(F.col("event_type").isin("flight_ticket_issued", "booking_confirmed"))
        .select(
            F.coalesce(F.col("ticket_id"), F.col("booking_id")).alias("ticket_id"),
            "customer_id",
            F.coalesce(F.col("booking_reference"), F.col("pnr_code")).alias("booking_reference"),
            F.coalesce(F.col("airline"), F.lit("Vietjet Air")).alias("airline"),
            F.coalesce(F.col("flight_number"), F.lit("VJ0000")).alias("flight_number"),
            F.coalesce(F.col("trip_type"), F.lit("one_way")).alias("trip_type"),
            "origin_airport",
            "destination_airport",
            F.to_timestamp(F.coalesce(F.col("booking_at"), F.col("booking_timestamp"))).alias("booking_at"),
            F.to_timestamp("departure_at").alias("departure_at"),
            F.to_timestamp("return_departure_at").alias("return_departure_at"),
            F.coalesce(F.col("cabin_class"), F.lit("economy")).alias("cabin_class"),
            F.coalesce(F.col("passenger_count"), F.lit(1)).alias("passenger_count"),
            F.coalesce(F.col("distance_km"), F.lit(0)).alias("distance_km"),
            F.coalesce(F.col("flight_duration_minutes"), F.lit(0)).alias("flight_duration_minutes"),
            F.coalesce(F.col("base_fare"), F.col("ticket_amount"), F.lit(0.0)).alias("base_fare"),
            F.coalesce(F.col("taxes"), F.lit(0.0)).alias("taxes"),
            F.coalesce(F.col("total_price"), F.col("ticket_amount"), F.lit(0.0)).alias("total_price"),
            F.coalesce(F.col("currency"), F.lit("VND")).alias("currency"),
            F.coalesce(F.col("baggage_kg"), F.lit(20)).alias("baggage_kg"),
            F.coalesce(F.col("status"), F.lit("ticketed")).alias("status"),
            "city",
        )
        .withColumn("is_vietjet_air", F.col("airline") == F.lit("Vietjet Air"))
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
