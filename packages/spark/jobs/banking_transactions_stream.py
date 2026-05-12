import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

CHECKPOINT_PATH = "s3a://silver/checkpoints/banking-transactions-stream"
TARGET_PATH = "s3a://silver/banking/streaming"
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "redpanda-svc.redpanda.svc.cluster.local:9092",
)
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "banking-transactions")

TRANSACTION_SCHEMA = T.StructType(
    [
        T.StructField("transaction_id", T.LongType(), True),
        T.StructField("account_id", T.LongType(), True),
        T.StructField("customer_id", T.LongType(), True),
        T.StructField("amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("merchant_category", T.StringType(), True),
        T.StructField("country_code", T.StringType(), True),
        T.StructField("timestamp", T.TimestampType(), True),
        T.StructField("transaction_type", T.StringType(), True),
        T.StructField("status", T.StringType(), True),
        T.StructField("channel", T.StringType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("banking-transactions-stream")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )


def main() -> None:
    spark = build_session()

    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .load()
        .select(F.from_json(F.col("value").cast("string"), TRANSACTION_SCHEMA).alias("event"))
        .select("event.*")
        .where(F.col("transaction_id").isNotNull())
        .where(F.col("account_id").isNotNull())
        .where(F.col("amount").isNotNull())
        .where(F.col("amount") > 0)
        .select(
            F.col("transaction_id").cast("long"),
            F.col("account_id").cast("long"),
            F.col("customer_id").cast("long"),
            F.round(F.col("amount").cast("double"), 2).alias("amount"),
            F.upper(F.col("currency")).alias("currency"),
            F.upper(F.col("merchant_category")).alias("merchant_category"),
            F.upper(F.col("country_code")).alias("country_code"),
            F.col("timestamp"),
            F.upper(F.col("transaction_type")).alias("transaction_type"),
            F.upper(F.col("status")).alias("status"),
            F.upper(F.col("channel")).alias("channel"),
        )
    )

    query = (
        raw.writeStream.format("delta")
        .option("checkpointLocation", CHECKPOINT_PATH)
        .option("path", TARGET_PATH)
        .outputMode("append")
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
