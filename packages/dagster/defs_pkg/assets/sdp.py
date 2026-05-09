import dagster as dg
from dagster_spark import SparkPipelinesResource

from ..config import (
    CUSTOMER_DIR,
    CUSTOMER_SPEC,
    MEDALLION_DIR,
    MEDALLION_SPEC,
    WEEKLY_DIR,
    WEEKLY_SPEC,
)
from ..utils import purge_objects


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "sdp_silver_orders",
            group_name="sdp",
            deps=["bronze_orders"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "sdp_gold_daily_country_sales",
            group_name="sdp",
            deps=["bronze_orders"],
            kinds={"spark"},
        ),
    ],
)
def medallion_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    purge_objects(
        context,
        "gold",
        "sdp-warehouse/silver_orders",
        "sdp-warehouse/gold_daily_country_sales",
        "pipeline/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=MEDALLION_SPEC,
        working_dir=MEDALLION_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_silver_orders")
    yield dg.MaterializeResult(asset_key="sdp_gold_daily_country_sales")


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "sdp_silver_customers",
            group_name="sdp",
            deps=["bronze_orders", "sdp_silver_orders"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "sdp_gold_customer_ltv",
            group_name="sdp",
            deps=["bronze_orders", "sdp_silver_orders"],
            kinds={"spark"},
        ),
    ],
)
def customer_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    purge_objects(
        context,
        "gold",
        "sdp-warehouse/silver_customers",
        "sdp-warehouse/gold_customer_ltv",
        "pipeline-customer/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=CUSTOMER_SPEC,
        working_dir=CUSTOMER_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_silver_customers")
    yield dg.MaterializeResult(asset_key="sdp_gold_customer_ltv")


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "sdp_gold_weekly_revenue",
            group_name="sdp",
            deps=["bronze_orders", "sdp_gold_customer_ltv"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "sdp_gold_weekly_growth",
            group_name="sdp",
            deps=["bronze_orders", "sdp_gold_customer_ltv"],
            kinds={"spark"},
        ),
    ],
)
def weekly_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    purge_objects(
        context,
        "gold",
        "sdp-warehouse/gold_weekly_revenue",
        "sdp-warehouse/gold_weekly_growth",
        "pipeline-weekly/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=WEEKLY_SPEC,
        working_dir=WEEKLY_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_gold_weekly_revenue")
    yield dg.MaterializeResult(asset_key="sdp_gold_weekly_growth")
