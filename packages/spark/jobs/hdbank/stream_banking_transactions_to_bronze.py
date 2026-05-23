from __future__ import annotations

import os
import sys
from pathlib import Path

from pyspark.sql import functions as F
from pyspark.sql import types as T

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import HDBANK_BRONZE_TRANSACTIONS_PATH, build_session

CHECKPOINT_PATH = os.getenv(
    "BRONZE_CHECKPOINT_PATH",
    "s3a://unitycatalog/hdbank/checkpoints/hdbank_partnership_prod_bronze/banking_transactions_v1",
)
TARGET_PATH = os.getenv("BRONZE_TARGET_PATH", HDBANK_BRONZE_TRANSACTIONS_PATH)
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "redpanda-svc.redpanda.svc.cluster.local:9092",
)
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "hdbank.partner_events_v1")
STARTING_OFFSETS = os.getenv("KAFKA_STARTING_OFFSETS", "latest")

TRANSACTION_SCHEMA = T.StructType(
    [
        T.StructField("event_type", T.StringType(), True),
        T.StructField("transaction_id", T.StringType(), True),
        T.StructField("payment_event_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("accountId", T.StringType(), True),
        T.StructField("account_id", T.StringType(), True),
        T.StructField("posted_at", T.StringType(), True),
        T.StructField("payment_timestamp", T.StringType(), True),
        T.StructField("transaction_type", T.StringType(), True),
        T.StructField("channel", T.StringType(), True),
        T.StructField("merchant_category", T.StringType(), True),
        T.StructField("amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("source_bank", T.StringType(), True),
        T.StructField("destination_bank", T.StringType(), True),
        T.StructField("merchant_name", T.StringType(), True),
        T.StructField("balance_before", T.DoubleType(), True),
        T.StructField("balance_after", T.DoubleType(), True),
        T.StructField("city", T.StringType(), True),
    ]
)


def main() -> None:
    spark = build_session("hdbank-stream-banking-transactions-to-bronze")

    raw_events = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", STARTING_OFFSETS)
        .option("failOnDataLoss", "false")
        .load()
        .select(F.col("value").cast("string").alias("value"))
        .where(F.col("value").isNotNull())
        .withColumn("payload", F.from_json("value", TRANSACTION_SCHEMA))
        .select("payload.*")
        .where(F.col("event_type").isin("banking_transaction_recorded", "card_transaction_posted"))
        .select(
            F.coalesce(F.col("transaction_id"), F.col("payment_event_id")).alias("transaction_id"),
            "customer_id",
            F.coalesce(F.col("accountId"), F.col("account_id")).alias("accountId"),
            F.to_timestamp(F.coalesce(F.col("posted_at"), F.col("payment_timestamp"))).alias("posted_at"),
            F.coalesce(F.col("transaction_type"), F.lit("card_payment")).alias("transaction_type"),
            F.coalesce(F.col("channel"), F.lit("mobile_app")).alias("channel"),
            F.coalesce(F.col("merchant_category"), F.lit("shopping")).alias("merchant_category"),
            "amount",
            F.coalesce(F.col("currency"), F.lit("VND")).alias("currency"),
            F.coalesce(F.col("source_bank"), F.lit("hdbank")).alias("source_bank"),
            F.coalesce(F.col("destination_bank"), F.lit("hdbank")).alias("destination_bank"),
            "merchant_name",
            "balance_before",
            "balance_after",
            "city",
        )
        .withColumn(
            "touches_hdbank",
            (F.col("source_bank") == F.lit("hdbank")) | (F.col("destination_bank") == F.lit("hdbank")),
        )
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
