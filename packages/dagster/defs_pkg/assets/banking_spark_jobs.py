import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import S3A_CONF, SPARK_IMAGE
from .banking_bronze import bronze_transactions


@dg.asset(group_name="banking_silver", deps=[bronze_transactions], kinds={"spark"})
def banking_silver_transactions(
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
            "/opt/spark/jobs/banking_bronze_to_silver.py",
        ],
    ).get_materialize_result()


@dg.asset(group_name="banking_gold", deps=["banking_sdp_silver_transactions"], kinds={"spark"})
def banking_gold_account_balance_trends(
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
            "/opt/spark/jobs/banking_silver_to_gold_account_balances.py",
        ],
    ).get_materialize_result()
