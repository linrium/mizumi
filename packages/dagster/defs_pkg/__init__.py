import dagster as dg
from dagster_k8s import PipesK8sClient

from .assets.banking_bronze import (
    banking_bronze_raw_card_payment_events,
    banking_bronze_raw_customer_profile_events,
)
from .assets.banking_spark_jobs import (
    banking_gold_marts,
    banking_silver_card_payment_events,
    banking_silver_customer_profiles,
)
from .assets.banking_daft import (
    banking_gold_customer_risk_scores,
    banking_gold_fraud_pattern_analysis,
)
from .assets.banking_schedules import (
    banking_daily_schedule,
    banking_hourly_schedule,
)
from .assets.vietjetair_bronze import (
    vietjetair_bronze_raw_booking_events,
    vietjetair_bronze_raw_customer_events,
    vietjetair_bronze_raw_flight_events,
)
from .assets.vietjetair_spark_jobs import (
    vietjetair_gold_booking_analytics,
    vietjetair_silver_customers,
    vietjetair_silver_flights,
    vietjetair_silver_ticket_bookings,
)
from .assets.sandbox_spark_jobs import sandbox_seed_data


defs = dg.Definitions(
    assets=[
        banking_bronze_raw_card_payment_events,
        banking_bronze_raw_customer_profile_events,
        banking_silver_card_payment_events,
        banking_silver_customer_profiles,
        banking_gold_marts,
        banking_gold_customer_risk_scores,
        banking_gold_fraud_pattern_analysis,
        vietjetair_bronze_raw_flight_events,
        vietjetair_bronze_raw_customer_events,
        vietjetair_bronze_raw_booking_events,
        vietjetair_silver_flights,
        vietjetair_silver_customers,
        vietjetair_silver_ticket_bookings,
        vietjetair_gold_booking_analytics,
        sandbox_seed_data,
    ],
    schedules=[
        banking_daily_schedule,
        banking_hourly_schedule,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
    },
)
