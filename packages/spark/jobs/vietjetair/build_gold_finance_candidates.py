from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    HDBANK_SILVER_CUSTOMERS_PATH,
    VIETJETAIR_GOLD_TARGET_PATH,
    VIETJETAIR_SILVER_BOOKING_FEATURES_PATH,
    VIETJETAIR_SILVER_CUSTOMERS_PATH,
    build_session,
    write_delta,
)


def main() -> None:
    spark = build_session("vietjetair-build-gold-finance-candidates")

    customers = spark.read.format("delta").load(VIETJETAIR_SILVER_CUSTOMERS_PATH)
    bookings = spark.read.format("delta").load(VIETJETAIR_SILVER_BOOKING_FEATURES_PATH)
    hdbank_customers = spark.read.format("delta").load(HDBANK_SILVER_CUSTOMERS_PATH)

    candidates = (
        customers.alias("c")
        .join(bookings.alias("b"), "customer_id")
        .join(hdbank_customers.alias("h"), "customer_id", "left")
        .where(
            F.col("h.customer_id").isNull()
            | (~F.coalesce(F.col("c.has_hdbank_cobrand_card"), F.lit(False)))
        )
        .withColumn(
            "offer_name",
            F.when(F.coalesce(F.col("b.service_recovery_score"), F.lit(0.0)) >= F.lit(0.25), F.lit("hdbank_service_recovery_cashback"))
            .when(F.coalesce(F.col("b.frequent_flyer_score"), F.lit(0.0)) >= F.lit(0.7), F.lit("hdbank_cobrand_card_upgrade"))
            .otherwise(F.lit("hdbank_fly_now_pay_later")),
        )
        .withColumn(
            "use_case",
            F.when(
                F.coalesce(F.col("b.service_recovery_score"), F.lit(0.0)) >= F.lit(0.25),
                F.lit("vietjet_service_recovery_cross_promo"),
            ).otherwise(F.lit("vietjet_frequent_flyer_without_hdbank_relationship")),
        )
        .withColumn(
            "propensity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.coalesce(F.col("b.frequent_flyer_score"), F.lit(0.0))
                    + F.coalesce(F.col("b.service_recovery_score"), F.lit(0.0)) * F.lit(0.4)
                    + F.when(F.coalesce(F.col("c.email_opt_in"), F.lit(False)), F.lit(0.07)).otherwise(F.lit(0.0))
                    + F.when(F.coalesce(F.col("c.annual_flights"), F.lit(0)) >= 12, F.lit(0.04)).otherwise(F.lit(0.0)),
                ),
                2,
            ),
        )
        .withColumn(
            "recommended_channel",
            F.when(F.coalesce(F.col("c.email_opt_in"), F.lit(False)), F.lit("email")).otherwise(F.lit("vietjet_app")),
        )
        .select(
            F.col("c.customer_id").alias("customer_id"),
            F.col("c.customer_name").alias("customer_name"),
            "offer_name",
            "use_case",
            "propensity_score",
            "recommended_channel",
            F.col("b.gross_booking_value").alias("signal_value"),
        )
    )

    write_delta(candidates, VIETJETAIR_GOLD_TARGET_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="vietjetair_gold_hdbank_finance_candidates",
            metadata={"row_count": candidates.count(), "target": VIETJETAIR_GOLD_TARGET_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
