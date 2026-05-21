import dagster as dg
from dagster_k8s import PipesK8sClient

from .assets.cross_sell_pipeline import (
    build_gold_cross_sell,
    build_hdbank_silver,
    build_vietjetair_silver,
    cross_sell_daily_schedule,
    partnership_gold_campaign_summary,
    seed_partner_bronze_events,
)


defs = dg.Definitions(
    assets=[
        seed_partner_bronze_events,
        build_hdbank_silver,
        build_vietjetair_silver,
        build_gold_cross_sell,
        partnership_gold_campaign_summary,
    ],
    schedules=[
        cross_sell_daily_schedule,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
    },
)
