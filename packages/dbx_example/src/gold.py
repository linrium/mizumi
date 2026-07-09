from databricks.sdk.runtime import spark

# pyrefly: ignore [missing-module-attribute]
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from common import TABLES, _priority_band


@dp.materialized_view(name=TABLES["hdbank_gold_activation_candidates"])
def hdbank_gold_activation_candidates():
    customers = spark.read.table(TABLES["hdbank_silver_customers"])
    travel = spark.read.table(TABLES["hdbank_silver_travel_features"])
    vietjet_customers = spark.read.table(TABLES["vietjetair_silver_customers"])
    vietjet_bookings = spark.read.table(TABLES["vietjetair_silver_booking_features"])

    return (
        customers.alias("c")
        .join(travel.alias("t"), "customer_id")
        .join(vietjet_customers.alias("v"), "customer_id", "left")
        .join(vietjet_bookings.alias("b"), F.col("v.customer_id") == F.col("b.customer_id"), "left")
        .where(F.col("c.customer_id").isNotNull())
        .where(F.col("v.customer_id").isNull() | (F.coalesce(F.col("b.vietjet_booking_count"), F.lit(0)) <= F.lit(1)))
        .withColumn(
            "offer_name",
            F.when(F.col("t.travel_spend") >= F.lit(7_500_000), F.lit("vietjet_priority_weekend_bundle"))
            .when(F.col("c.has_credit_card"), F.lit("vietjet_cobrand_card_bonus"))
            .otherwise(F.lit("vietjet_starter_bundle")),
        )
        .withColumn(
            "use_case",
            F.when(F.col("v.customer_id").isNull(), F.lit("hdbank_customer_without_vietjet_relationship")).otherwise(
                F.lit("existing_hdbank_customer_with_low_vietjet_engagement")
            ),
        )
        .withColumn(
            "propensity_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.col("t.cross_sell_readiness_score")
                    + (F.coalesce(F.col("c.monthly_income"), F.lit(0.0)) / F.lit(160_000_000.0))
                    + F.when(F.col("c.has_credit_card"), F.lit(0.05)).otherwise(F.lit(0.0))
                    + F.when(F.coalesce(F.col("t.has_vietjet_spend"), F.lit(0)) == 0, F.lit(0.05)).otherwise(
                        F.lit(0.0)
                    ),
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
            F.col("c.customer_name").alias("customer_name"),
            "offer_name",
            "use_case",
            "propensity_score",
            "recommended_channel",
            F.col("t.travel_spend").alias("signal_value"),
        )
    )


@dp.materialized_view(name=TABLES["vietjetair_gold_finance_candidates"])
def vietjetair_gold_finance_candidates():
    customers = spark.read.table(TABLES["vietjetair_silver_customers"])
    bookings = spark.read.table(TABLES["vietjetair_silver_booking_features"])
    hdbank_customers = spark.read.table(TABLES["hdbank_silver_customers"])

    return (
        customers.alias("c")
        .join(bookings.alias("b"), "customer_id")
        .join(hdbank_customers.alias("h"), "customer_id", "left")
        .where(F.col("h.customer_id").isNull() | (~F.coalesce(F.col("c.has_hdbank_cobrand_card"), F.lit(False))))
        .withColumn(
            "offer_name",
            F.when(
                F.coalesce(F.col("b.service_recovery_score"), F.lit(0.0)) >= F.lit(0.25),
                F.lit("hdbank_service_recovery_cashback"),
            )
            .when(
                F.coalesce(F.col("b.frequent_flyer_score"), F.lit(0.0)) >= F.lit(0.7),
                F.lit("hdbank_cobrand_card_upgrade"),
            )
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


@dp.materialized_view(name=TABLES["partnership_gold_offer_audience"])
def partnership_gold_offer_audience():
    hdbank_candidates = spark.read.table(TABLES["hdbank_gold_activation_candidates"])
    vietjet_candidates = spark.read.table(TABLES["vietjetair_gold_finance_candidates"])

    return (
        hdbank_candidates.withColumn("source_company", F.lit("hdbank"))
        .withColumn("target_company", F.lit("vietjetair"))
        .unionByName(
            vietjet_candidates.withColumn("source_company", F.lit("vietjetair")).withColumn(
                "target_company", F.lit("hdbank")
            )
        )
        .withColumn("priority_band", _priority_band("propensity_score"))
    )
