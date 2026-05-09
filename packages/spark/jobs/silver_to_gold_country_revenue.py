from pyspark.sql import SparkSession, functions as F, Window
from dagster_pipes import open_dagster_pipes

SOURCE_PATH = "s3a://silver/orders/silver_orders"
TARGET_PATH = "s3a://gold/country_revenue/"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("silver-to-gold-country-revenue")
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

        daily = (
            silver_df.groupBy("order_date", "country_code")
            .agg(
                F.round(F.sum("gross_amount"), 2).alias("daily_revenue"),
                F.count("*").alias("order_count"),
            )
        )

        running_window = (
            Window.partitionBy("country_code")
            .orderBy("order_date")
            .rowsBetween(Window.unboundedPreceding, Window.currentRow)
        )
        gold_df = daily.withColumn(
            "cumulative_revenue",
            F.round(F.sum("daily_revenue").over(running_window), 2),
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
