import dagster as dg
from dagster_k8s import PipesK8sClient
from dagster_spark import SparkPipelinesResource

from .assets.bronze import bronze_orders
from .assets.daft import daft_distributed_job, daft_simple_job
from .assets.sdp import customer_sdp, medallion_sdp, weekly_sdp
from .assets.spark_jobs import (
    gold_country_revenue,
    gold_customer_stats,
    silver_orders,
)


defs = dg.Definitions(
    assets=[
        bronze_orders,
        daft_distributed_job,
        daft_simple_job,
        silver_orders,
        gold_customer_stats,
        gold_country_revenue,
        medallion_sdp,
        customer_sdp,
        weekly_sdp,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
        "spark_pipelines": SparkPipelinesResource(
            spark_pipelines_cmd="spark-pipelines-s3",
        ),
    },
)
