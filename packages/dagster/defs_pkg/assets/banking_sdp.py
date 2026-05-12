import dagster as dg
from dagster_spark import SparkPipelinesResource

from ..config import (
    BANKING_TRANSACTIONS_DIR,
    BANKING_TRANSACTIONS_SPEC,
    BANKING_RISK_DIR,
    BANKING_RISK_SPEC,
    BANKING_CUSTOMER_DIR,
    BANKING_CUSTOMER_SPEC,
)
from ..utils import purge_objects


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "banking_sdp_silver_transactions",
            group_name="banking_sdp",
            deps=["bronze_transactions"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "banking_sdp_gold_daily_summary",
            group_name="banking_sdp",
            deps=["bronze_transactions"],
            kinds={"spark"},
        ),
    ],
)
def banking_transactions_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    purge_objects(
        context,
        "gold",
        "banking/sdp-warehouse/silver_transactions",
        "banking/sdp-warehouse/gold_daily_transaction_summary",
        "banking/pipeline-transactions/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=BANKING_TRANSACTIONS_SPEC,
        working_dir=BANKING_TRANSACTIONS_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="banking_sdp_silver_transactions")
    yield dg.MaterializeResult(asset_key="banking_sdp_gold_daily_summary")


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "banking_sdp_gold_aml_structuring",
            group_name="banking_sdp",
            deps=["banking_sdp_silver_transactions"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "banking_sdp_gold_aml_rapid_sequences",
            group_name="banking_sdp",
            deps=["banking_sdp_silver_transactions"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "banking_sdp_gold_monthly_revenue",
            group_name="banking_sdp",
            deps=["banking_sdp_silver_transactions"],
            kinds={"spark"},
        ),
    ],
)
def banking_risk_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    purge_objects(
        context,
        "gold",
        "banking/sdp-warehouse/gold_aml_structuring_alerts",
        "banking/sdp-warehouse/gold_aml_rapid_sequences",
        "banking/sdp-warehouse/gold_monthly_revenue_by_category",
        "banking/pipeline-risk/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=BANKING_RISK_SPEC,
        working_dir=BANKING_RISK_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="banking_sdp_gold_aml_structuring")
    yield dg.MaterializeResult(asset_key="banking_sdp_gold_aml_rapid_sequences")
    yield dg.MaterializeResult(asset_key="banking_sdp_gold_monthly_revenue")


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "banking_sdp_gold_customer_profile",
            group_name="banking_sdp",
            deps=["banking_sdp_silver_transactions"],
            kinds={"spark"},
        ),
        dg.AssetSpec(
            "banking_sdp_gold_customer_channel_usage",
            group_name="banking_sdp",
            deps=["banking_sdp_silver_transactions"],
            kinds={"spark"},
        ),
    ],
)
def banking_customer_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    purge_objects(
        context,
        "gold",
        "banking/sdp-warehouse/gold_customer_banking_profile",
        "banking/sdp-warehouse/gold_customer_channel_usage",
        "banking/pipeline-customer/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=BANKING_CUSTOMER_SPEC,
        working_dir=BANKING_CUSTOMER_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="banking_sdp_gold_customer_profile")
    yield dg.MaterializeResult(asset_key="banking_sdp_gold_customer_channel_usage")
