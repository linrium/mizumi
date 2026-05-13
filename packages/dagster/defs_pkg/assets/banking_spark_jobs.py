import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import S3A_CONF, SPARK_IMAGE


def _run_spark_job(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
    job_path: str,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "IfNotPresent",
                }
            ]
        },
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            job_path,
        ],
    ).get_materialize_result()


@dg.asset(group_name="banking_silver", deps=["bronze_transactions"], kinds={"spark", "k8s"})
def banking_silver_card_payment_events(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/bronze_to_silver.py",
    )


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "banking_gold_risk_detection",
            group_name="banking_gold",
            deps=["banking_silver_card_payment_events"],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "banking_gold_merchant_revenue",
            group_name="banking_gold",
            deps=["banking_silver_card_payment_events"],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "banking_gold_user_spend",
            group_name="banking_gold",
            deps=["banking_silver_card_payment_events"],
            kinds={"spark", "k8s"},
        ),
    ],
)
def banking_gold_marts(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/silver_to_gold.py",
    )
    yield dg.MaterializeResult(asset_key="banking_gold_risk_detection")
    yield dg.MaterializeResult(asset_key="banking_gold_merchant_revenue")
    yield dg.MaterializeResult(asset_key="banking_gold_user_spend")
