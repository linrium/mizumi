from pyspark.sql import SparkSession, functions as F
from dagster_pipes import open_dagster_pipes

SOURCE_PATH = "s3a://bronze/banking/transactions/raw/transactions.jsonl"
TARGET_PATH = "s3a://silver/banking/transactions"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("banking-bronze-to-silver")
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
                F.col("transaction_id").cast("long"),
                F.col("account_id").cast("long"),
                F.col("customer_id").cast("long"),
                F.round(F.col("amount").cast("double"), 2).alias("amount"),
                F.upper(F.col("currency")).alias("currency"),
                F.upper(F.col("merchant_category")).alias("merchant_category"),
                F.upper(F.col("country_code")).alias("country_code"),
                F.to_timestamp("timestamp").alias("timestamp"),
                F.upper(F.col("transaction_type")).alias("transaction_type"),
                F.upper(F.col("status")).alias("status"),
                F.upper(F.col("channel")).alias("channel"),
            )
            .dropDuplicates(["transaction_id"])
            .filter(F.col("status").isin("COMPLETED", "PENDING"))
            .filter(F.col("amount") > 0)
            .withColumn("transaction_date", F.to_date("timestamp"))
            .withColumn("processed_at", F.current_timestamp())
        )

        silver_df.write.format("delta").mode("overwrite").partitionBy("transaction_date").save(TARGET_PATH)

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
