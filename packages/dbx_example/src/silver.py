from databricks.sdk.runtime import spark

# pyrefly: ignore [missing-module-attribute]
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from common import TABLES, _home_airport, _priority_band


@dp.materialized_view(name=TABLES["hdbank_silver_customers"])
def hdbank_silver_customers():
    bronze_customers = spark.read.table(TABLES["hdbank_bronze_customers"])
    return bronze_customers.select(
        "customer_id",
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
        F.col("customer_case"),
        F.upper("customer_tier").alias("customer_tier"),
        F.col("average_monthly_balance"),
        F.upper("credit_score_band").alias("credit_score_band"),
        F.col("hdbank_affinity_score"),
        F.col("hdbank_since").cast("date").alias("hdbank_since"),
        F.col("has_vietjet_cobrand_card"),
        F.when(F.col("credit_score_band") == "A", F.lit("VERIFIED"))
        .when(F.col("credit_score_band") == "B", F.lit("SIMPLIFIED_DUE_DILIGENCE"))
        .otherwise(F.lit("REVIEW_REQUIRED"))
        .alias("kyc_status"),
        F.current_timestamp().alias("updated_at"),
    )


@dp.materialized_view(name=TABLES["hdbank_silver_travel_features"])
def hdbank_silver_travel_features():
    return (
        spark.read.table(TABLES["hdbank_bronze_transactions"])
        .groupBy("customer_id")
        .agg(
            F.count("*").cast("int").alias("transaction_count"),
            F.round(
                F.sum(
                    F.when(~F.col("transaction_type").isin("salary", "transfer_in"), F.col("amount")).otherwise(
                        F.lit(0.0)
                    )
                ),
                2,
            ).alias("total_card_spend"),
            F.round(
                F.sum(
                    F.when(
                        F.col("merchant_category").isin("airline_ticket", "ota_travel", "travel"), F.col("amount")
                    ).otherwise(F.lit(0.0))
                ),
                2,
            ).alias("travel_spend"),
            F.max(F.when(F.upper(F.col("merchant_name")).contains("VIETJET"), F.lit(1)).otherwise(F.lit(0))).alias(
                "has_vietjet_spend"
            ),
            F.max("posted_at").alias("last_payment_at"),
            F.round(
                F.sum(F.when(F.col("transaction_type") == "salary", F.col("amount")).otherwise(F.lit(0.0))), 2
            ).alias("salary_inflow"),
            F.round(
                F.sum(F.when(F.col("merchant_category") == "airline_ticket", F.col("amount")).otherwise(F.lit(0.0))), 2
            ).alias("airline_ticket_spend"),
            F.round(
                F.sum(F.when(F.col("merchant_category") == "ota_travel", F.col("amount")).otherwise(F.lit(0.0))), 2
            ).alias("ota_travel_spend"),
            F.round(F.avg(F.when(~F.col("transaction_type").isin("salary", "transfer_in"), F.col("amount"))), 2).alias(
                "avg_spend_amount"
            ),
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


@dp.materialized_view(name=TABLES["vietjetair_silver_customers"])
def vietjetair_silver_customers():
    return spark.read.table(TABLES["vietjetair_bronze_customers"]).select(
        "customer_id",
        "customer_name",
        "city",
        "age",
        F.upper("skyboss_tier").alias("membership_tier"),
        _home_airport("city").alias("home_airport"),
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


@dp.materialized_view(name=TABLES["vietjetair_silver_booking_features"])
def vietjetair_silver_booking_features():
    incident_features = (
        spark.read.table(TABLES["vietjetair_bronze_incidents"])
        .groupBy("customer_id")
        .agg(
            F.count("*").cast("int").alias("incident_count"),
            F.sum(F.when(F.col("incident_type") == "baggage_damaged", F.lit(1)).otherwise(F.lit(0)))
            .cast("int")
            .alias("baggage_damage_count"),
            F.sum(
                F.when(F.col("incident_type").isin("baggage_damaged", "baggage_delayed"), F.lit(1)).otherwise(F.lit(0))
            )
            .cast("int")
            .alias("baggage_incident_count"),
            F.round(F.avg("delayed_minutes"), 2).alias("avg_delay_minutes"),
            F.max("reported_at").alias("last_incident_at"),
            F.max(F.when(F.col("has_image"), F.lit(1)).otherwise(F.lit(0))).alias("has_baggage_image"),
        )
    )

    return (
        spark.read.table(TABLES["vietjetair_bronze_tickets"])
        .groupBy("customer_id")
        .agg(
            F.count("*").cast("int").alias("booking_count"),
            F.round(F.sum("total_price"), 2).alias("gross_booking_value"),
            F.round(F.avg("total_price"), 2).alias("avg_booking_value"),
            F.max("booking_at").alias("last_booking_at"),
            F.sum(F.when(F.col("is_vietjet_air"), F.lit(1)).otherwise(F.lit(0)))
            .cast("int")
            .alias("vietjet_booking_count"),
            F.sum(F.when(~F.col("is_vietjet_air"), F.lit(1)).otherwise(F.lit(0)))
            .cast("int")
            .alias("competitor_booking_count"),
            F.round(F.sum(F.when(F.col("is_vietjet_air"), F.col("total_price")).otherwise(F.lit(0.0))), 2).alias(
                "vietjet_booking_value"
            ),
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


@dp.materialized_view(name=TABLES["partnership_silver_customer_360"])
def partnership_silver_customer_360():
    hdbank_customers = spark.read.table(TABLES["hdbank_silver_customers"])
    hdbank_travel = spark.read.table(TABLES["hdbank_silver_travel_features"])
    vietjet_customers = spark.read.table(TABLES["vietjetair_silver_customers"])
    vietjet_bookings = spark.read.table(TABLES["vietjetair_silver_booking_features"])

    return (
        hdbank_customers.alias("h")
        .join(hdbank_travel.alias("ht"), "customer_id", "left")
        .join(vietjet_customers.alias("v"), F.col("h.customer_id") == F.col("v.customer_id"), "full_outer")
        .join(vietjet_bookings.alias("vb"), F.col("v.customer_id") == F.col("vb.customer_id"), "left")
        .select(
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
            _priority_band("ht.cross_sell_readiness_score").alias("hdbank_priority_band"),
            _priority_band("vb.frequent_flyer_score").alias("vietjet_priority_band"),
            F.current_timestamp().alias("updated_at"),
        )
    )
