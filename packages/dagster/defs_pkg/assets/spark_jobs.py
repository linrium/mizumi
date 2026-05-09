import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import S3A_CONF, SPARK_IMAGE
from .bronze import bronze_orders


@dg.asset(group_name="silver", deps=[bronze_orders], kinds={"spark"})
def silver_orders(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/bronze_to_silver.py",
        ],
    ).get_materialize_result()


@dg.asset(group_name="gold", deps=["sdp_silver_orders"], kinds={"spark"})
def gold_customer_stats(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/silver_to_gold_customer_stats.py",
        ],
    ).get_materialize_result()


@dg.asset(group_name="gold", deps=["sdp_silver_orders"], kinds={"spark"})
def gold_country_revenue(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/silver_to_gold_country_revenue.py",
        ],
    ).get_materialize_result()
