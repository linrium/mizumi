from pyspark.sql import SparkSession, functions as F


SOURCE_PATH = "s3a://bronze/orders/raw/orders.jsonl"
TARGET_PATH = "s3a://silver/orders/silver_orders"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("rustfs-bronze-to-silver")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )


def main() -> None:
    spark = build_session()

    bronze_df = spark.read.json(SOURCE_PATH)

    silver_df = (
        bronze_df.select(
            F.col("order_id").cast("long"),
            F.col("customer_id").cast("long"),
            F.upper(F.col("country")).alias("country_code"),
            F.upper(F.col("status")).alias("status"),
            F.col("quantity").cast("int"),
            F.col("unit_price").cast("double"),
            F.to_timestamp("ordered_at").alias("ordered_at"),
        )
        .dropDuplicates(["order_id"])
        .filter(F.col("status").isin("PAID", "SHIPPED", "DELIVERED"))
        .withColumn("order_date", F.to_date("ordered_at"))
        .withColumn("gross_amount", F.round(F.col("quantity") * F.col("unit_price"), 2))
        .withColumn("processed_at", F.current_timestamp())
    )

    silver_df.write.mode("overwrite").partitionBy("order_date").parquet(TARGET_PATH)

    print(f"bronze_rows={bronze_df.count()}")
    print(f"silver_rows={silver_df.count()}")

    spark.stop()


if __name__ == "__main__":
    main()
