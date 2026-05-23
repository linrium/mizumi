from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    VIETJETAIR_BRONZE_CUSTOMERS_PATH,
    VIETJETAIR_BRONZE_CUSTOMERS_CSV_PATH,
    VIETJETAIR_BRONZE_CUSTOMERS_CSV_FALLBACK_PATH,
    build_session,
    read_first_existing_csv,
    write_delta,
)


def main() -> None:
    spark = build_session("vietjetair-build-bronze-customers")
    source_df, source_path = read_first_existing_csv(
        spark,
        [
            VIETJETAIR_BRONZE_CUSTOMERS_CSV_FALLBACK_PATH,
            VIETJETAIR_BRONZE_CUSTOMERS_CSV_PATH,
        ],
    )

    customers = (
        source_df
        .withColumnRenamed("userId", "unified_customer_id")
        .withColumnRenamed("fullName", "customer_name")
        .withColumnRenamed("skybossTier", "skyboss_tier")
        .withColumnRenamed("vietjetAirAffinityScore", "vietjetair_affinity_score")
        .withColumnRenamed("annualFlights", "annual_flights")
        .withColumnRenamed("ancillarySpendScore", "ancillary_spend_score")
        .withColumnRenamed("vietjetAirSince", "vietjetair_since")
        .withColumnRenamed("hasHdbankCoBrandCard", "has_hdbank_cobrand_card")
        .withColumn("customer_id", F.col("unified_customer_id"))
        .withColumn("shared_customer", F.col("customerCase") == F.lit("both_hdbank_and_vietjetair"))
        .withColumn("age", F.col("age").cast("int"))
        .withColumn("annual_flights", F.col("annual_flights").cast("int"))
        .withColumn("ancillary_spend_score", F.col("ancillary_spend_score").cast("double"))
        .withColumn("vietjetair_affinity_score", F.col("vietjetair_affinity_score").cast("double"))
        .withColumn("seed_timestamp", F.current_timestamp())
    )

    write_delta(customers, VIETJETAIR_BRONZE_CUSTOMERS_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="vietjetair_bronze_customers",
            metadata={
                "row_count": customers.count(),
                "source": source_path,
                "target": VIETJETAIR_BRONZE_CUSTOMERS_PATH,
            },
        )

    spark.stop()


if __name__ == "__main__":
    main()
