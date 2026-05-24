from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    VIETJETAIR_BRONZE_CUSTOMERS_PATH,
    VIETJETAIR_BRONZE_INCIDENTS_PATH,
    VIETJETAIR_BRONZE_TICKETS_PATH,
    VIETJETAIR_SILVER_BOOKING_FEATURES_PATH,
    VIETJETAIR_SILVER_CUSTOMERS_PATH,
    build_session,
    with_home_airport,
    write_delta,
)


def main() -> None:
    spark = build_session("vietjetair-build-silver")

    bronze_customers = spark.read.format("delta").load(VIETJETAIR_BRONZE_CUSTOMERS_PATH)
    bronze_tickets = spark.read.format("delta").load(VIETJETAIR_BRONZE_TICKETS_PATH)
    bronze_incidents = spark.read.format("delta").load(VIETJETAIR_BRONZE_INCIDENTS_PATH)

    customers_df = (
        bronze_customers.select(
            "customer_id",
            "customer_name",
            "city",
            "age",
            F.upper("skyboss_tier").alias("membership_tier"),
            with_home_airport("city").alias("home_airport"),
            (
                (F.col("vietjetair_affinity_score") >= F.lit(0.52))
                | (F.col("shared_customer") == F.lit(True))
                | (F.col("annual_flights") >= F.lit(10))
            ).alias("email_opt_in"),
            F.col("shared_customer"),
            F.col("customer_case"),
            F.upper("skyboss_tier").alias("skyboss_tier"),
            F.col("annual_flights"),
            F.col("ancillary_spend_score"),
            F.col("vietjetair_affinity_score"),
            F.col("vietjetair_since").cast("date").alias("vietjetair_since"),
            F.col("has_hdbank_cobrand_card"),
            F.current_timestamp().alias("updated_at"),
        )
    )

    incident_features = (
        bronze_incidents.groupBy("customer_id")
        .agg(
            F.count("*").cast("int").alias("incident_count"),
            F.sum(F.when(F.col("incident_type") == "baggage_damaged", F.lit(1)).otherwise(F.lit(0))).cast("int").alias("baggage_damage_count"),
            F.sum(F.when(F.col("incident_type").isin("baggage_damaged", "baggage_delayed"), F.lit(1)).otherwise(F.lit(0))).cast("int").alias("baggage_incident_count"),
            F.round(F.avg("delayed_minutes"), 2).alias("avg_delay_minutes"),
            F.max("reported_at").alias("last_incident_at"),
            F.max(F.when(F.col("has_image"), F.lit(1)).otherwise(F.lit(0))).alias("has_baggage_image"),
        )
    )

    booking_features_df = (
        bronze_tickets.groupBy("customer_id")
        .agg(
            F.count("*").cast("int").alias("booking_count"),
            F.round(F.sum("total_price"), 2).alias("gross_booking_value"),
            F.round(F.avg("total_price"), 2).alias("avg_booking_value"),
            F.max("booking_at").alias("last_booking_at"),
            F.sum(F.when(F.col("is_vietjet_air"), F.lit(1)).otherwise(F.lit(0))).cast("int").alias("vietjet_booking_count"),
            F.sum(F.when(~F.col("is_vietjet_air"), F.lit(1)).otherwise(F.lit(0))).cast("int").alias("competitor_booking_count"),
            F.round(F.sum(F.when(F.col("is_vietjet_air"), F.col("total_price")).otherwise(F.lit(0.0))), 2).alias("vietjet_booking_value"),
            F.round(F.avg("baggage_kg"), 2).alias("avg_baggage_kg"),
            F.round(F.avg("distance_km"), 2).alias("avg_distance_km"),
        )
        .join(incident_features, on="customer_id", how="left")
        .na.fill(
            {
                "incident_count": 0,
                "baggage_damage_count": 0,
                "baggage_incident_count": 0,
                "avg_delay_minutes": 0.0,
                "has_baggage_image": 0,
            }
        )
        .withColumn(
            "frequent_flyer_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.lit(0.2)
                    + (F.col("booking_count") / F.lit(10.0))
                    + (F.col("gross_booking_value") / F.lit(35_000_000.0))
                    + (F.col("vietjet_booking_count") / F.lit(12.0)),
                ),
                2,
            ),
        )
        .withColumn(
            "service_recovery_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    (F.col("baggage_damage_count") * F.lit(0.18))
                    + (F.col("baggage_incident_count") * F.lit(0.08))
                    + (F.col("avg_delay_minutes") / F.lit(240.0)),
                ),
                2,
            ),
        )
    )

    write_delta(customers_df, VIETJETAIR_SILVER_CUSTOMERS_PATH)
    write_delta(booking_features_df, VIETJETAIR_SILVER_BOOKING_FEATURES_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="vietjetair_silver_customers",
            metadata={"row_count": customers_df.count(), "target": VIETJETAIR_SILVER_CUSTOMERS_PATH},
        )
        pipes.report_asset_materialization(
            asset_key="vietjetair_silver_booking_features",
            metadata={"row_count": booking_features_df.count(), "target": VIETJETAIR_SILVER_BOOKING_FEATURES_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
