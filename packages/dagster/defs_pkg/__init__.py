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


defs = dg.Definitions(
    assets=[
        banking_bronze_raw_card_payment_events,
        banking_bronze_raw_customer_profile_events,
        banking_silver_card_payment_events,
        banking_silver_customer_profiles,
        banking_gold_marts,
        banking_gold_customer_risk_scores,
        banking_gold_fraud_pattern_analysis,
    ],
    schedules=[
        banking_daily_schedule,
        banking_hourly_schedule,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
    },
)
