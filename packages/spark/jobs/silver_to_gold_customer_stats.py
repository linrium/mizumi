from pyspark.sql import SparkSession, functions as F
from dagster_pipes import open_dagster_pipes

SOURCE_PATH = "s3a://silver/orders/silver_orders"
TARGET_PATH = "s3a://gold/customer_stats/"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("silver-to-gold-customer-stats")
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

        silver_df = spark.read.parquet(SOURCE_PATH)

        gold_df = (
            silver_df.groupBy("customer_id", "country_code")
            .agg(
                F.count("*").alias("order_count"),
                F.round(F.sum("gross_amount"), 2).alias("total_spend"),
                F.round(F.avg("gross_amount"), 2).alias("avg_order_value"),
                F.min("order_date").alias("first_order_date"),
                F.max("order_date").alias("last_order_date"),
            )
        )

        row_count = gold_df.count()
        gold_df.write.format("delta").mode("overwrite").save(TARGET_PATH)
        spark.stop()

        pipes.report_asset_materialization(
            metadata={
                "row_count": row_count,
                "source": SOURCE_PATH,
                "target": TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
