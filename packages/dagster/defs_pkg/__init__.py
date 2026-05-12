import dagster as dg
from dagster_k8s import PipesK8sClient
from dagster_spark import SparkPipelinesResource

from .assets.bronze import bronze_orders
from .assets.daft import daft_distributed_job, daft_simple_job
from .assets.datafusion import datafusion_rustfs_query
from .assets.duckdb import duckdb_delta_query
from .assets.sdp import customer_sdp, medallion_sdp, weekly_sdp
from .assets.spark_jobs import (
    gold_country_revenue,
    gold_customer_stats,
    silver_orders,
)
from .assets.banking_bronze import bronze_transactions
from .assets.banking_spark_jobs import (
    banking_silver_transactions,
    banking_gold_account_balance_trends,
)
from .assets.banking_sdp import (
    banking_transactions_sdp,
    banking_risk_sdp,
    banking_customer_sdp,
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
        bronze_orders,
        datafusion_rustfs_query,
        duckdb_delta_query,
        daft_distributed_job,
        daft_simple_job,
        silver_orders,
        gold_customer_stats,
        gold_country_revenue,
        medallion_sdp,
        customer_sdp,
        weekly_sdp,
        # banking
        bronze_transactions,
        banking_silver_transactions,
        banking_transactions_sdp,
        banking_risk_sdp,
        banking_customer_sdp,
        banking_gold_account_balance_trends,
        banking_gold_customer_risk_scores,
        banking_gold_fraud_pattern_analysis,
    ],
    schedules=[
        banking_daily_schedule,
        banking_hourly_schedule,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
        "spark_pipelines": SparkPipelinesResource(
            spark_pipelines_cmd="spark-pipelines-s3",
        ),
    },
)
