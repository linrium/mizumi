from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    HDBANK_SILVER_CUSTOMERS_PATH,
    HDBANK_SILVER_TRAVEL_FEATURES_PATH,
    PARTNERSHIP_SILVER_CUSTOMER_360_PATH,
    VIETJETAIR_SILVER_BOOKING_FEATURES_PATH,
    VIETJETAIR_SILVER_CUSTOMERS_PATH,
    build_session,
    priority_band,
    write_delta,
)


def main() -> None:
    spark = build_session("partnership-build-customer-360")

    hdbank_customers = spark.read.format("delta").load(HDBANK_SILVER_CUSTOMERS_PATH)
    hdbank_travel = spark.read.format("delta").load(HDBANK_SILVER_TRAVEL_FEATURES_PATH)
    vietjet_customers = spark.read.format("delta").load(VIETJETAIR_SILVER_CUSTOMERS_PATH)
    vietjet_bookings = spark.read.format("delta").load(VIETJETAIR_SILVER_BOOKING_FEATURES_PATH)

    customer_360 = (
        hdbank_customers.alias("h")
        .join(hdbank_travel.alias("ht"), "customer_id", "left")
        .join(vietjet_customers.alias("v"), F.col("h.unified_customer_id") == F.col("v.unified_customer_id"), "full_outer")
        .join(vietjet_bookings.alias("vb"), F.col("v.customer_id") == F.col("vb.customer_id"), "left")
        .select(
            F.coalesce(F.col("h.unified_customer_id"), F.col("v.unified_customer_id")).alias("unified_customer_id"),
            F.coalesce(F.col("h.customer_id"), F.col("v.customer_id")).alias("customer_id"),
            F.coalesce(F.col("h.customer_name"), F.col("v.customer_name")).alias("customer_name"),
            F.coalesce(F.col("h.city"), F.col("v.city")).alias("city"),
            F.coalesce(F.col("h.age"), F.col("v.age")).alias("age"),
            F.col("h.customer_id").isNotNull().alias("has_hdbank_relationship"),
            F.col("v.customer_id").isNotNull().alias("has_vietjetair_relationship"),
            F.coalesce(F.col("h.shared_customer"), F.col("v.shared_customer"), F.lit(False)).alias("shared_customer"),
            F.col("h.segment_name"),
            F.col("h.preferred_channel"),
            F.col("h.monthly_income"),
            F.col("h.credit_score"),
            F.col("h.has_credit_card"),
            F.col("h.average_monthly_balance"),
            F.col("ht.transaction_count"),
            F.col("ht.total_card_spend"),
            F.col("ht.travel_spend"),
            F.col("ht.airline_ticket_spend"),
            F.col("ht.ota_travel_spend"),
            F.col("ht.has_vietjet_spend"),
            F.col("ht.travel_affinity_score"),
            F.col("ht.cross_sell_readiness_score"),
            F.col("v.membership_tier"),
            F.col("v.home_airport"),
            F.col("v.email_opt_in"),
            F.col("v.annual_flights"),
            F.col("v.ancillary_spend_score"),
            F.col("v.has_hdbank_cobrand_card"),
            F.col("vb.booking_count"),
            F.col("vb.vietjet_booking_count"),
            F.col("vb.competitor_booking_count"),
            F.col("vb.gross_booking_value"),
            F.col("vb.avg_booking_value"),
            F.col("vb.incident_count"),
            F.col("vb.baggage_damage_count"),
            F.col("vb.baggage_incident_count"),
            F.col("vb.avg_delay_minutes"),
            F.col("vb.has_baggage_image"),
            F.col("vb.frequent_flyer_score"),
            F.col("vb.service_recovery_score"),
            priority_band("ht.cross_sell_readiness_score").alias("hdbank_priority_band"),
            priority_band("vb.frequent_flyer_score").alias("vietjet_priority_band"),
            F.current_timestamp().alias("updated_at"),
        )
    )

    write_delta(customer_360, PARTNERSHIP_SILVER_CUSTOMER_360_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="partnership_silver_customer_360",
            metadata={"row_count": customer_360.count(), "target": PARTNERSHIP_SILVER_CUSTOMER_360_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
