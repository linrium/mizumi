from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    HDBANK_BRONZE_CUSTOMERS_PATH,
    HDBANK_BRONZE_CUSTOMERS_CSV_PATH,
    HDBANK_BRONZE_CUSTOMERS_CSV_FALLBACK_PATH,
    build_session,
    read_first_existing_csv,
    write_delta,
)


def main() -> None:
    spark = build_session("hdbank-build-bronze-customers")
    source_df, source_path = read_first_existing_csv(
        spark,
        [
            HDBANK_BRONZE_CUSTOMERS_CSV_FALLBACK_PATH,
            HDBANK_BRONZE_CUSTOMERS_CSV_PATH,
        ],
    )

    hdbank_customers = (
        source_df
        .withColumnRenamed("userId", "customer_id")
        .withColumnRenamed("fullName", "customer_name")
        .withColumnRenamed("customerTier", "customer_tier")
        .withColumnRenamed("customerCase", "customer_case")
        .withColumnRenamed("creditScoreBand", "credit_score_band")
        .withColumnRenamed("averageMonthlyBalance", "average_monthly_balance")
        .withColumnRenamed("hdbankAffinityScore", "hdbank_affinity_score")
        .withColumnRenamed("hdbankSince", "hdbank_since")
        .withColumnRenamed("hasVietjetCoBrandCard", "has_vietjet_cobrand_card")
        .withColumn("shared_customer", F.col("customer_case") == F.lit("both_hdbank_and_vietjetair"))
        .withColumn("age", F.col("age").cast("int"))
        .withColumn("average_monthly_balance", F.col("average_monthly_balance").cast("double"))
        .withColumn("hdbank_affinity_score", F.col("hdbank_affinity_score").cast("double"))
        .withColumn("hdbank_since", F.col("hdbank_since").cast("date"))
        .withColumn("has_vietjet_cobrand_card", F.col("has_vietjet_cobrand_card").cast("boolean"))
        .withColumn("seed_timestamp", F.current_timestamp())
        .select(
            "customer_id",
            "customer_name",
            "city",
            "age",
            "customer_case",
            "customer_tier",
            "hdbank_affinity_score",
            "average_monthly_balance",
            "credit_score_band",
            "hdbank_since",
            "has_vietjet_cobrand_card",
            "shared_customer",
            "seed_timestamp",
        )
    )

    write_delta(hdbank_customers, HDBANK_BRONZE_CUSTOMERS_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="hdbank_bronze_customers",
            metadata={
                "row_count": hdbank_customers.count(),
                "source": source_path,
                "target": HDBANK_BRONZE_CUSTOMERS_PATH,
            },
        )

    spark.stop()


if __name__ == "__main__":
    main()
