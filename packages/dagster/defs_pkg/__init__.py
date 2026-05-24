import dagster as dg
from dagster_k8s import PipesK8sClient

from .assets.cross_sell_pipeline import (
    cross_sell_daily_schedule,
    hdbank_bronze_customers,
    hdbank_gold_vietjet_activation_candidates,
    partnership_gold_co_brand_offer_audience,
    partnership_gold_campaign_summary,
    partnership_silver_customer_360,
    build_hdbank_silver,
    build_vietjetair_silver,
    vietjetair_bronze_customers,
    vietjetair_gold_baggage_damage_classifications,
    vietjetair_gold_hdbank_finance_candidates,
)


defs = dg.Definitions(
    assets=[
        hdbank_bronze_customers,
        vietjetair_bronze_customers,
        build_hdbank_silver,
        build_vietjetair_silver,
        partnership_silver_customer_360,
        hdbank_gold_vietjet_activation_candidates,
        vietjetair_gold_hdbank_finance_candidates,
        vietjetair_gold_baggage_damage_classifications,
        partnership_gold_co_brand_offer_audience,
        partnership_gold_campaign_summary,
    ],
    schedules=[
        cross_sell_daily_schedule,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
    },
)
