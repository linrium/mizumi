from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

SOURCE_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_card_payment_events_v1"
)
TARGET_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_payments_prod_silver/card_payment_events_v1"
)

RAW_EVENT_SCHEMA = T.StructType(
    [
        T.StructField("payment_event_id", T.StringType(), True),
        T.StructField("transaction_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("account_id", T.StringType(), True),
        T.StructField("transaction_reference", T.StringType(), True),
        T.StructField("merchant_name", T.StringType(), True),
        T.StructField("merchant_category", T.StringType(), True),
        T.StructField("amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("payment_timestamp", T.TimestampType(), True),
        T.StructField("timestamp", T.TimestampType(), True),
        T.StructField("note", T.StringType(), True),
        T.StructField("status", T.StringType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("hdbank-bronze-to-silver")
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

        bronze_df = spark.read.format("delta").load(SOURCE_PATH)
        parsed_df = bronze_df.select(
            F.col("timestamp").alias("event_timestamp"),
            F.from_json(F.col("value"), RAW_EVENT_SCHEMA).alias("event"),
        )

        silver_df = (
            parsed_df.select(
                F.coalesce(
                    F.col("event.payment_event_id"),
                    F.col("event.transaction_id"),
                ).alias("payment_event_id"),
                F.col("event.customer_id").cast("string").alias("customer_id"),
                F.col("event.account_id").cast("string").alias("account_id"),
                F.coalesce(
                    F.col("event.transaction_reference"),
                    F.col("event.transaction_id"),
                ).alias("transaction_reference"),
                F.upper(F.col("event.merchant_name")).alias("merchant_name"),
                F.upper(F.col("event.merchant_category")).alias("merchant_category"),
                F.round(F.col("event.amount").cast("double"), 2).alias("amount"),
                F.upper(F.col("event.currency")).alias("currency"),
                F.coalesce(
                    F.col("event.payment_timestamp"),
                    F.col("event.timestamp"),
                    F.col("event_timestamp"),
                ).alias("payment_timestamp"),
                F.trim(F.col("event.note")).alias("note"),
                F.upper(F.coalesce(F.col("event.status"), F.lit("COMPLETED"))).alias("status"),
            )
            .where(F.col("payment_event_id").isNotNull())
            .where(F.col("customer_id").isNotNull())
            .where(F.col("account_id").isNotNull())
            .where(F.col("amount").isNotNull())
            .where(F.col("amount") > 0)
            .where(F.col("payment_timestamp").isNotNull())
            .where(F.col("status").isin("COMPLETED", "SETTLED"))
            .dropDuplicates(["payment_event_id"])
        )

        silver_df.write.format("delta").mode("overwrite").save(TARGET_PATH)

        bronze_count = bronze_df.count()
        silver_count = silver_df.count()
        spark.stop()

        pipes.report_asset_materialization(
            metadata={
                "bronze_rows": bronze_count,
                "silver_rows": silver_count,
                "source": SOURCE_PATH,
                "target": TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
