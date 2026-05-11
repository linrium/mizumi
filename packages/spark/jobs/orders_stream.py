from pyspark.sql import SparkSession
from pyspark.sql import functions as F

CHECKPOINT_PATH = "s3a://silver/checkpoints/orders-stream"
TARGET_PATH = "s3a://silver/orders/streaming"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("orders-stream")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )


def main() -> None:
    spark = build_session()

    # Simulated order events — swap for readStream.format("kafka") or .format("json") in production
    raw = (
        spark.readStream.format("rate")
        .option("rowsPerSecond", 10)
        .load()
        .select(
            F.col("timestamp"),
            (F.col("value") % 1_000_000).alias("order_id"),
            (F.col("value") % 500).cast("long").alias("customer_id"),
            F.when(F.col("value") % 3 == 0, "US")
             .when(F.col("value") % 3 == 1, "GB")
             .otherwise("DE").alias("country_code"),
            F.when(F.col("value") % 4 == 0, "PAID")
             .when(F.col("value") % 4 == 1, "SHIPPED")
             .when(F.col("value") % 4 == 2, "DELIVERED")
             .otherwise("PENDING").alias("status"),
            F.round((F.rand() * 190 + 10), 2).alias("amount"),
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
        agg.writeStream.format("parquet")
        .option("checkpointLocation", CHECKPOINT_PATH)
        .option("path", TARGET_PATH)
        .outputMode("append")
        # .trigger(processingTime="10 seconds")
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
