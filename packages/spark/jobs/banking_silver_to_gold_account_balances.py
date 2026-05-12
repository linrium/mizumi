from pyspark.sql import SparkSession, functions as F, Window
from dagster_pipes import open_dagster_pipes

SOURCE_PATH = "s3a://silver/banking/transactions"
TARGET_PATH = "s3a://gold/banking/account_balance_trends"


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("banking-silver-to-gold-account-balances")
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

        silver_df = spark.read.format("delta").load(SOURCE_PATH)

        # Daily net flow: credits add to balance, debits/transfers subtract
        daily = (
            silver_df.groupBy("account_id", "transaction_date")
            .agg(
                F.round(
                    F.sum(
                        F.when(F.col("transaction_type") == "CREDIT", F.col("amount"))
                        .otherwise(-F.col("amount"))
                    ),
                    2,
                ).alias("daily_net_flow"),
                F.count("*").alias("transaction_count"),
                F.round(F.sum("amount"), 2).alias("total_volume"),
            )
        )

        running_window = (
            Window.partitionBy("account_id")
            .orderBy("transaction_date")
            .rowsBetween(Window.unboundedPreceding, Window.currentRow)
        )
        rolling_window = (
            Window.partitionBy("account_id")
            .orderBy("transaction_date")
            .rowsBetween(-29, Window.currentRow)
        )

        gold_df = (
            daily
            .withColumn("cumulative_balance", F.round(F.sum("daily_net_flow").over(running_window), 2))
            .withColumn("rolling_30d_avg_volume", F.round(F.avg("total_volume").over(rolling_window), 2))
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
