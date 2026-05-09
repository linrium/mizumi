from pyspark.sql import SparkSession, functions as F
from dagster_pipes import open_dagster_pipes

SOURCE_PATH = "s3a://bronze/orders/raw/orders.jsonl"
TARGET_PATH = "s3a://silver/orders/silver_orders"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("rustfs-bronze-to-silver")
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

        silver_df.write.format("delta").mode("overwrite").partitionBy("order_date").save(TARGET_PATH)

        bronze_count = bronze_df.count()
        silver_count = silver_df.count()
        spark.stop()

        pipes.report_asset_materialization(
            metadata={
                "bronze_rows": bronze_count,
                "silver_rows": silver_count,
                "target": TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
