# pyrefly: ignore [missing-module-attribute]
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from common import (
    BANKING_TRANSACTION_SCHEMA,
    FLIGHT_INCIDENT_SCHEMA,
    FLIGHT_TICKET_SCHEMA,
    HDBANK_CUSTOMER_SCHEMA,
    TABLES,
    VIETJETAIR_CUSTOMER_SCHEMA,
    _csv,
)


@dp.materialized_view(name=TABLES["hdbank_bronze_customers"])
def hdbank_bronze_customers():
    return (
        _csv("hdbank_customers.csv", HDBANK_CUSTOMER_SCHEMA)
        .withColumnRenamed("userId", "customer_id")
        .withColumnRenamed("fullName", "customer_name")
        .withColumnRenamed("customerCase", "customer_case")
        .withColumnRenamed("customerTier", "customer_tier")
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


@dp.materialized_view(name=TABLES["hdbank_bronze_transactions"])
def hdbank_bronze_transactions():
    return (
        _csv("banking_transactions.csv", BANKING_TRANSACTION_SCHEMA)
        .select(
            F.col("transactionId").alias("transaction_id"),
            F.col("userId").alias("customer_id"),
            F.col("accountId").alias("accountId"),
            F.to_timestamp("postedAt").alias("posted_at"),
            F.coalesce(F.col("transactionType"), F.lit("card_payment")).alias("transaction_type"),
            F.coalesce(F.col("channel"), F.lit("mobile_app")).alias("channel"),
            F.coalesce(F.col("merchantCategory"), F.lit("shopping")).alias("merchant_category"),
            F.col("amount").cast("double").alias("amount"),
            F.coalesce(F.col("currency"), F.lit("VND")).alias("currency"),
            F.coalesce(F.col("sourceBank"), F.lit("hdbank")).alias("source_bank"),
            F.coalesce(F.col("destinationBank"), F.lit("hdbank")).alias("destination_bank"),
            F.col("merchantName").alias("merchant_name"),
            F.col("balanceBefore").cast("double").alias("balance_before"),
            F.col("balanceAfter").cast("double").alias("balance_after"),
            "city",
        )
        .withColumn(
            "touches_hdbank",
            (F.col("source_bank") == F.lit("hdbank")) | (F.col("destination_bank") == F.lit("hdbank")),
        )
        .withColumn("seed_timestamp", F.current_timestamp())
    )


@dp.materialized_view(name=TABLES["vietjetair_bronze_customers"])
def vietjetair_bronze_customers():
    return (
        _csv("vietjetair_customers.csv", VIETJETAIR_CUSTOMER_SCHEMA)
        .withColumnRenamed("userId", "customer_id")
        .withColumnRenamed("fullName", "customer_name")
        .withColumnRenamed("customerCase", "customer_case")
        .withColumnRenamed("skybossTier", "skyboss_tier")
        .withColumnRenamed("vietjetAirAffinityScore", "vietjetair_affinity_score")
        .withColumnRenamed("annualFlights", "annual_flights")
        .withColumnRenamed("ancillarySpendScore", "ancillary_spend_score")
        .withColumnRenamed("vietjetAirSince", "vietjetair_since")
        .withColumnRenamed("hasHdbankCoBrandCard", "has_hdbank_cobrand_card")
        .withColumn("shared_customer", F.col("customer_case") == F.lit("both_hdbank_and_vietjetair"))
        .withColumn("age", F.col("age").cast("int"))
        .withColumn("annual_flights", F.col("annual_flights").cast("int"))
        .withColumn("ancillary_spend_score", F.col("ancillary_spend_score").cast("double"))
        .withColumn("vietjetair_affinity_score", F.col("vietjetair_affinity_score").cast("double"))
        .withColumn("vietjetair_since", F.col("vietjetair_since").cast("date"))
        .withColumn("has_hdbank_cobrand_card", F.col("has_hdbank_cobrand_card").cast("boolean"))
        .withColumn("seed_timestamp", F.current_timestamp())
        .select(
            "customer_id",
            "customer_name",
            "city",
            "age",
            "customer_case",
            "skyboss_tier",
            "vietjetair_affinity_score",
            "annual_flights",
            "ancillary_spend_score",
            "vietjetair_since",
            "has_hdbank_cobrand_card",
            "shared_customer",
            "seed_timestamp",
        )
    )


@dp.materialized_view(name=TABLES["vietjetair_bronze_tickets"])
def vietjetair_bronze_tickets():
    return (
        _csv("flight_tickets.csv", FLIGHT_TICKET_SCHEMA)
        .select(
            F.col("ticketId").alias("ticket_id"),
            F.col("userId").alias("customer_id"),
            F.col("bookingReference").alias("booking_reference"),
            F.coalesce(F.col("airline"), F.lit("Vietjet Air")).alias("airline"),
            F.coalesce(F.col("flightNumber"), F.lit("VJ0000")).alias("flight_number"),
            F.coalesce(F.col("tripType"), F.lit("one_way")).alias("trip_type"),
            F.col("originAirport").alias("origin_airport"),
            F.col("destinationAirport").alias("destination_airport"),
            F.to_timestamp("bookingAt").alias("booking_at"),
            F.to_timestamp("departureAt").alias("departure_at"),
            F.to_timestamp("returnDepartureAt").alias("return_departure_at"),
            F.coalesce(F.col("cabinClass"), F.lit("economy")).alias("cabin_class"),
            F.coalesce(F.col("passengerCount").cast("int"), F.lit(1)).alias("passenger_count"),
            F.coalesce(F.col("distanceKm").cast("int"), F.lit(0)).alias("distance_km"),
            F.coalesce(F.col("flightDurationMinutes").cast("int"), F.lit(0)).alias("flight_duration_minutes"),
            F.coalesce(F.col("baseFare").cast("double"), F.lit(0.0)).alias("base_fare"),
            F.coalesce(F.col("taxes").cast("double"), F.lit(0.0)).alias("taxes"),
            F.coalesce(F.col("totalPrice").cast("double"), F.lit(0.0)).alias("total_price"),
            F.coalesce(F.col("currency"), F.lit("VND")).alias("currency"),
            F.coalesce(F.col("baggageKg").cast("int"), F.lit(20)).alias("baggage_kg"),
            F.coalesce(F.col("status"), F.lit("ticketed")).alias("status"),
            "city",
        )
        .withColumn("is_vietjet_air", F.col("airline") == F.lit("Vietjet Air"))
        .withColumn("seed_timestamp", F.current_timestamp())
    )


@dp.materialized_view(name=TABLES["vietjetair_bronze_incidents"])
def vietjetair_bronze_incidents():
    return (
        _csv("flight_incidents.csv", FLIGHT_INCIDENT_SCHEMA)
        .select(
            F.col("reportId").alias("report_id"),
            F.col("vietjetCustomerId").alias("customer_id"),
            F.col("ticketId").alias("ticket_id"),
            F.col("bookingReference").alias("booking_reference"),
            F.coalesce(F.col("airline"), F.lit("Vietjet Air")).alias("airline"),
            F.coalesce(F.col("reportChannel"), F.lit("vietjetair_app")).alias("report_channel"),
            F.col("incidentType").alias("incident_type"),
            "severity",
            F.col("issueAirport").alias("issue_airport"),
            F.col("originAirport").alias("origin_airport"),
            F.col("destinationAirport").alias("destination_airport"),
            F.col("flightNumber").alias("flight_number"),
            F.to_timestamp("departureDate").alias("departure_date"),
            F.to_timestamp("reportedAt").alias("reported_at"),
            "status",
            F.col("baggageTag").alias("baggage_tag"),
            F.coalesce(F.col("delayedMinutes").cast("int"), F.lit(0)).alias("delayed_minutes"),
            F.coalesce(F.col("currency"), F.lit("VND")).alias("currency"),
            "city",
            F.col("imagePath").alias("image_path"),
        )
        # pyrefly: ignore [bad-argument-count]
        .withColumn("has_image", F.col("image_path").isNotNull() & (F.length("image_path") > 0))
        .withColumn("seed_timestamp", F.current_timestamp())
    )
