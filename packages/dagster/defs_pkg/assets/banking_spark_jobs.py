import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import S3A_CONF, SPARK_IMAGE


@dg.asset(group_name="banking_gold", deps=["banking_sdp_silver_transactions"], kinds={"spark"})
def banking_gold_account_balance_trends(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={"containers": [{"name": "dagster-pipes-execution", "imagePullPolicy": "IfNotPresent"}]},
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/banking_silver_to_gold_account_balances.py",
        ],
    ).get_materialize_result()
