from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    HDBANK_GOLD_TARGET_PATH,
    HDBANK_SILVER_CUSTOMERS_PATH,
    HDBANK_SILVER_TRAVEL_FEATURES_PATH,
    VIETJETAIR_SILVER_BOOKING_FEATURES_PATH,
    VIETJETAIR_SILVER_CUSTOMERS_PATH,
    build_session,
    write_delta,
)


def main() -> None:
    spark = build_session("hdbank-build-gold-activation-candidates")

    customers = spark.read.format("delta").load(HDBANK_SILVER_CUSTOMERS_PATH)
    travel = spark.read.format("delta").load(HDBANK_SILVER_TRAVEL_FEATURES_PATH)
    vietjet_customers = spark.read.format("delta").load(VIETJETAIR_SILVER_CUSTOMERS_PATH)
    vietjet_bookings = spark.read.format("delta").load(VIETJETAIR_SILVER_BOOKING_FEATURES_PATH)

    candidates = (
        customers.alias("c")
        .join(travel.alias("t"), "customer_id")
        .join(vietjet_customers.alias("v"), "unified_customer_id", "left")
        .join(vietjet_bookings.alias("b"), F.col("v.customer_id") == F.col("b.customer_id"), "left")
        .where(F.col("c.customer_id").isNotNull())
        .where(
            F.col("v.customer_id").isNull()
            | (F.coalesce(F.col("b.vietjet_booking_count"), F.lit(0)) <= F.lit(1))
        )
        .withColumn(
            "offer_name",
            F.when(F.col("t.travel_spend") >= F.lit(7_500_000), F.lit("vietjet_priority_weekend_bundle"))
            .when(F.col("c.has_credit_card"), F.lit("vietjet_cobrand_card_bonus"))
            .otherwise(F.lit("vietjet_starter_bundle")),
        )
        .withColumn(
            "use_case",
            F.when(F.col("v.customer_id").isNull(), F.lit("hdbank_customer_without_vietjet_relationship"))
            .otherwise(F.lit("existing_hdbank_customer_with_low_vietjet_engagement")),
        )
        .withColumn(
            "propensity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.col("t.cross_sell_readiness_score")
                    + (F.coalesce(F.col("c.monthly_income"), F.lit(0.0)) / F.lit(160_000_000.0))
                    + F.when(F.col("c.has_credit_card"), F.lit(0.05)).otherwise(F.lit(0.0))
                    + F.when(F.coalesce(F.col("t.has_vietjet_spend"), F.lit(0)) == 0, F.lit(0.05)).otherwise(F.lit(0.0)),
                ),
                2,
            ),
        )
        .withColumn(
            "recommended_channel",
            F.when(F.col("c.preferred_channel") == "APP", F.lit("hdbank_app"))
            .when(F.col("c.preferred_channel") == "BRANCH", F.lit("relationship_manager"))
            .otherwise(F.lit("sms")),
        )
        .select(
            F.col("c.customer_id").alias("customer_id"),
            F.col("c.unified_customer_id"),
            F.col("c.customer_name").alias("customer_name"),
            "offer_name",
            "use_case",
            "propensity_score",
            "recommended_channel",
            F.col("t.travel_spend").alias("signal_value"),
        )
    )

    write_delta(candidates, HDBANK_GOLD_TARGET_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="hdbank_gold_vietjet_activation_candidates",
            metadata={"row_count": candidates.count(), "target": HDBANK_GOLD_TARGET_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
