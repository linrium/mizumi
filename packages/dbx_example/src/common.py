from databricks.sdk.runtime import spark

from pyspark.sql import functions as F
from pyspark.sql import types as T


def _conf(name: str, default: str) -> str | None:
    return spark.conf.get(f"mizumi.{name}", default)


BRONZE_CATALOG = _conf("bronze_catalog", "weaver_linh_sandbox_bronze")
SILVER_CATALOG = _conf("silver_catalog", "weaver_linh_sandbox_silver")
GOLD_CATALOG = _conf("gold_catalog", "weaver_linh_sandbox_gold")
SCHEMA = _conf("schema", "default")
BRONZE_VOLUME = _conf("bronze_volume", "sample_spark_jobs")
BRONZE_VOLUME_PATH = f"/Volumes/{BRONZE_CATALOG}/{SCHEMA}/{BRONZE_VOLUME}"

TABLES = {
    "hdbank_bronze_customers": f"{BRONZE_CATALOG}.{SCHEMA}.hdbank_customers_bronze",
    "hdbank_bronze_transactions": f"{BRONZE_CATALOG}.{SCHEMA}.hdbank_banking_transactions_bronze",
    "vietjetair_bronze_customers": f"{BRONZE_CATALOG}.{SCHEMA}.vietjetair_customers_bronze",
    "vietjetair_bronze_tickets": f"{BRONZE_CATALOG}.{SCHEMA}.vietjetair_flight_tickets_bronze",
    "vietjetair_bronze_incidents": f"{BRONZE_CATALOG}.{SCHEMA}.vietjetair_flight_incidents_bronze",
    "hdbank_silver_customers": f"{SILVER_CATALOG}.{SCHEMA}.hdbank_customers",
    "hdbank_silver_travel_features": f"{SILVER_CATALOG}.{SCHEMA}.hdbank_travel_spend_features",
    "vietjetair_silver_customers": f"{SILVER_CATALOG}.{SCHEMA}.vietjetair_customers",
    "vietjetair_silver_booking_features": f"{SILVER_CATALOG}.{SCHEMA}.vietjetair_booking_features",
    "partnership_silver_customer_360": f"{SILVER_CATALOG}.{SCHEMA}.partnership_customer_360",
    "hdbank_gold_activation_candidates": f"{GOLD_CATALOG}.{SCHEMA}.hdbank_vietjet_activation_candidates",
    "vietjetair_gold_finance_candidates": f"{GOLD_CATALOG}.{SCHEMA}.vietjetair_hdbank_finance_candidates",
    "partnership_gold_offer_audience": f"{GOLD_CATALOG}.{SCHEMA}.partnership_co_brand_offer_audience",
}

HDBANK_CUSTOMER_SCHEMA = T.StructType(
    [
        T.StructField("userId", T.StringType()),
        T.StructField("fullName", T.StringType()),
        T.StructField("city", T.StringType()),
        T.StructField("age", T.StringType()),
        T.StructField("customerCase", T.StringType()),
        T.StructField("customerTier", T.StringType()),
        T.StructField("hdbankAffinityScore", T.StringType()),
        T.StructField("averageMonthlyBalance", T.StringType()),
        T.StructField("creditScoreBand", T.StringType()),
        T.StructField("hdbankSince", T.StringType()),
        T.StructField("hasVietjetCoBrandCard", T.StringType()),
    ]
)

VIETJETAIR_CUSTOMER_SCHEMA = T.StructType(
    [
        T.StructField("userId", T.StringType()),
        T.StructField("fullName", T.StringType()),
        T.StructField("city", T.StringType()),
        T.StructField("age", T.StringType()),
        T.StructField("customerCase", T.StringType()),
        T.StructField("skybossTier", T.StringType()),
        T.StructField("vietjetAirAffinityScore", T.StringType()),
        T.StructField("annualFlights", T.StringType()),
        T.StructField("ancillarySpendScore", T.StringType()),
        T.StructField("vietjetAirSince", T.StringType()),
        T.StructField("hasHdbankCoBrandCard", T.StringType()),
    ]
)

BANKING_TRANSACTION_SCHEMA = T.StructType(
    [
        T.StructField("transactionId", T.StringType()),
        T.StructField("userId", T.StringType()),
        T.StructField("accountId", T.StringType()),
        T.StructField("postedAt", T.StringType()),
        T.StructField("transactionType", T.StringType()),
        T.StructField("channel", T.StringType()),
        T.StructField("merchantCategory", T.StringType()),
        T.StructField("amount", T.StringType()),
        T.StructField("currency", T.StringType()),
        T.StructField("sourceBank", T.StringType()),
        T.StructField("destinationBank", T.StringType()),
        T.StructField("merchantName", T.StringType()),
        T.StructField("balanceBefore", T.StringType()),
        T.StructField("balanceAfter", T.StringType()),
        T.StructField("city", T.StringType()),
    ]
)

FLIGHT_TICKET_SCHEMA = T.StructType(
    [
        T.StructField("ticketId", T.StringType()),
        T.StructField("userId", T.StringType()),
        T.StructField("bookingReference", T.StringType()),
        T.StructField("airline", T.StringType()),
        T.StructField("flightNumber", T.StringType()),
        T.StructField("tripType", T.StringType()),
        T.StructField("originAirport", T.StringType()),
        T.StructField("destinationAirport", T.StringType()),
        T.StructField("bookingAt", T.StringType()),
        T.StructField("departureAt", T.StringType()),
        T.StructField("returnDepartureAt", T.StringType()),
        T.StructField("cabinClass", T.StringType()),
        T.StructField("passengerCount", T.StringType()),
        T.StructField("distanceKm", T.StringType()),
        T.StructField("flightDurationMinutes", T.StringType()),
        T.StructField("baseFare", T.StringType()),
        T.StructField("taxes", T.StringType()),
        T.StructField("totalPrice", T.StringType()),
        T.StructField("currency", T.StringType()),
        T.StructField("baggageKg", T.StringType()),
        T.StructField("status", T.StringType()),
        T.StructField("city", T.StringType()),
    ]
)

FLIGHT_INCIDENT_SCHEMA = T.StructType(
    [
        T.StructField("reportId", T.StringType()),
        T.StructField("vietjetCustomerId", T.StringType()),
        T.StructField("ticketId", T.StringType()),
        T.StructField("bookingReference", T.StringType()),
        T.StructField("airline", T.StringType()),
        T.StructField("reportChannel", T.StringType()),
        T.StructField("incidentType", T.StringType()),
        T.StructField("severity", T.StringType()),
        T.StructField("issueAirport", T.StringType()),
        T.StructField("originAirport", T.StringType()),
        T.StructField("destinationAirport", T.StringType()),
        T.StructField("flightNumber", T.StringType()),
        T.StructField("departureDate", T.StringType()),
        T.StructField("reportedAt", T.StringType()),
        T.StructField("status", T.StringType()),
        T.StructField("baggageTag", T.StringType()),
        T.StructField("delayedMinutes", T.StringType()),
        T.StructField("currency", T.StringType()),
        T.StructField("city", T.StringType()),
        T.StructField("imagePath", T.StringType()),
    ]
)


def _csv(path: str, schema: T.StructType):
    return spark.read.option("header", "true").schema(schema).csv(f"{BRONZE_VOLUME_PATH}/{path}")


def _home_airport(city_col: str) -> F.Column:
    return (
        F.when(F.col(city_col) == "Ho Chi Minh", F.lit("SGN"))
        .when(F.col(city_col) == "Ha Noi", F.lit("HAN"))
        .when(F.col(city_col) == "Da Nang", F.lit("DAD"))
        .when(F.col(city_col) == "Hai Phong", F.lit("HPH"))
        .otherwise(F.lit("SGN"))
    )


def _priority_band(score_col: str) -> F.Column:
    return (
        F.when(F.col(score_col) >= F.lit(0.82), F.lit("high"))
        .when(F.col(score_col) >= F.lit(0.64), F.lit("medium"))
        .otherwise(F.lit("nurture"))
    )
