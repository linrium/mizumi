from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    HDBANK_BRONZE_CUSTOMERS_PATH,
    HDBANK_BRONZE_TRANSACTIONS_PATH,
    HDBANK_SILVER_CUSTOMERS_PATH,
    HDBANK_SILVER_TRAVEL_FEATURES_PATH,
    build_session,
    write_delta,
)


def main() -> None:
    spark = build_session("hdbank-build-silver")

    bronze_customers = spark.read.format("delta").load(HDBANK_BRONZE_CUSTOMERS_PATH)
    bronze_transactions = spark.read.format("delta").load(HDBANK_BRONZE_TRANSACTIONS_PATH)

    customers_df = (
        bronze_customers.select(
            "customer_id",
            "unified_customer_id",
            "customer_name",
            "city",
            "age",
            F.upper("customer_tier").alias("segment_name"),
            F.when(F.col("age") < 30, F.lit("APP"))
            .when(F.col("age") < 50, F.lit("SMS"))
            .otherwise(F.lit("BRANCH"))
            .alias("preferred_channel"),
            F.round(F.col("average_monthly_balance") / F.lit(1.45), 2).alias("monthly_income"),
            F.when(F.col("credit_score_band") == "A", F.lit(780))
            .when(F.col("credit_score_band") == "B", F.lit(690))
            .otherwise(F.lit(610))
            .alias("credit_score"),
            (
                (F.col("has_vietjet_cobrand_card") == F.lit(True))
                | F.upper(F.col("customer_tier")).isin("GOLD", "PLATINUM", "DIAMOND")
            ).alias("has_credit_card"),
            F.col("shared_customer"),
            F.col("customerCase").alias("customer_case"),
            F.upper("customer_tier").alias("customer_tier"),
            F.col("average_monthly_balance"),
            F.upper("credit_score_band").alias("credit_score_band"),
            F.col("hdbank_affinity_score"),
            F.col("hdbank_since"),
            F.col("has_vietjet_cobrand_card"),
            F.when(F.col("credit_score_band") == "A", F.lit("VERIFIED"))
            .when(F.col("credit_score_band") == "B", F.lit("SIMPLIFIED_DUE_DILIGENCE"))
            .otherwise(F.lit("REVIEW_REQUIRED"))
            .alias("kyc_status"),
            F.current_timestamp().alias("updated_at"),
        )
    )

    travel_features_df = (
        bronze_transactions.groupBy("customer_id")
        .agg(
            F.count("*").cast("int").alias("transaction_count"),
            F.round(F.sum(F.when(~F.col("transaction_type").isin("salary", "transfer_in"), F.col("amount")).otherwise(F.lit(0.0))), 2).alias("total_card_spend"),
            F.round(F.sum(F.when(F.col("merchant_category").isin("airline_ticket", "ota_travel", "travel"), F.col("amount")).otherwise(F.lit(0.0))), 2).alias("travel_spend"),
            F.max(F.when(F.upper(F.col("merchant_name")).contains("VIETJET"), F.lit(1)).otherwise(F.lit(0))).alias("has_vietjet_spend"),
            F.max("posted_at").alias("last_payment_at"),
            F.round(F.sum(F.when(F.col("transaction_type") == "salary", F.col("amount")).otherwise(F.lit(0.0))), 2).alias("salary_inflow"),
            F.round(F.sum(F.when(F.col("merchant_category") == "airline_ticket", F.col("amount")).otherwise(F.lit(0.0))), 2).alias("airline_ticket_spend"),
            F.round(F.sum(F.when(F.col("merchant_category") == "ota_travel", F.col("amount")).otherwise(F.lit(0.0))), 2).alias("ota_travel_spend"),
            F.round(F.avg(F.when(~F.col("transaction_type").isin("salary", "transfer_in"), F.col("amount"))), 2).alias("avg_spend_amount"),
        )
        .withColumn(
            "travel_affinity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.lit(0.18)
                    + (F.col("travel_spend") / F.lit(18_000_000.0))
                    + (F.col("airline_ticket_spend") / F.lit(12_000_000.0))
                    + F.when(F.col("has_vietjet_spend") == 1, F.lit(0.12)).otherwise(F.lit(0.0)),
                ),
                2,
            ),
        )
        .withColumn(
            "cross_sell_readiness_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.col("travel_affinity_score")
                    + (F.col("salary_inflow") / F.lit(80_000_000.0))
                    + (F.col("total_card_spend") / F.lit(40_000_000.0)),
                ),
                2,
            ),
        )
    )

    write_delta(customers_df, HDBANK_SILVER_CUSTOMERS_PATH)
    write_delta(travel_features_df, HDBANK_SILVER_TRAVEL_FEATURES_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="hdbank_silver_customers",
            metadata={"row_count": customers_df.count(), "target": HDBANK_SILVER_CUSTOMERS_PATH},
        )
        pipes.report_asset_materialization(
            asset_key="hdbank_silver_travel_spend_features",
            metadata={"row_count": travel_features_df.count(), "target": HDBANK_SILVER_TRAVEL_FEATURES_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
