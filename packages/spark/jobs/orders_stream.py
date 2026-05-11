import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

CHECKPOINT_PATH = "s3a://silver/checkpoints/orders-stream-kafka"
TARGET_PATH = "s3a://silver/orders/streaming"
KAFKA_BOOTSTRAP_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "redpanda-svc.redpanda.svc.cluster.local:9092",
)
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "mizumi-orders")

ORDER_SCHEMA = T.StructType(
    [
        T.StructField("timestamp", T.TimestampType(), True),
        T.StructField("order_id", T.LongType(), True),
        T.StructField("customer_id", T.LongType(), True),
        T.StructField("country_code", T.StringType(), True),
        T.StructField("status", T.StringType(), True),
        T.StructField("amount", T.DoubleType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("orders-stream")
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
        .select(F.from_json(F.col("value").cast("string"), ORDER_SCHEMA).alias("event"))
        .select("event.*")
        .where(F.col("timestamp").isNotNull())
        .where(F.col("order_id").isNotNull())
        .where(F.col("customer_id").isNotNull())
        .where(F.col("country_code").isNotNull())
        .where(F.col("status").isNotNull())
        .where(F.col("amount").isNotNull())
        .select(
            F.col("timestamp"),
            F.col("order_id").cast("long").alias("order_id"),
            F.col("customer_id").cast("long").alias("customer_id"),
            F.col("country_code"),
            F.col("status"),
            F.round(F.col("amount").cast("double"), 2).alias("amount"),
        )
    )

    # 1-minute tumbling window: order count + revenue per country
    agg = (
        raw.withWatermark("timestamp", "2 minutes")
        .groupBy(
            F.window("timestamp", "1 minute"),
            "country_code",
        )
        .agg(
            F.count("order_id").alias("order_count"),
            F.round(F.sum("amount"), 2).alias("total_revenue"),
            F.approx_count_distinct("customer_id").alias("unique_customers"),
        )
        .select(
            F.col("window.start").alias("window_start"),
            F.col("window.end").alias("window_end"),
            "country_code",
            "order_count",
            "total_revenue",
            "unique_customers",
        )
    )

    query = (
        agg.writeStream.format("delta")
        .option("checkpointLocation", CHECKPOINT_PATH)
        .option("path", TARGET_PATH)
        .outputMode("append")
        # .trigger(processingTime="10 seconds")
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
