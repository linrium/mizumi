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
                    "imagePullPolicy": "Never",
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


@dg.asset(
    group_name="banking_silver",
    deps=["banking_bronze_raw_card_payment_events"],
    kinds={"spark", "k8s"},
)
def banking_silver_card_payment_events(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/build_card_payment_events_silver.py",
    )


@dg.asset(
    group_name="banking_silver",
    deps=["banking_bronze_raw_customer_profile_events"],
    kinds={"spark", "k8s"},
)
def banking_silver_customer_profiles(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/build_customer_profiles_silver.py",
    )


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "banking_gold_risk_detection",
            group_name="banking_gold",
            deps=["banking_silver_card_payment_events", "banking_silver_customer_profiles"],
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
    yield from pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "Never",
                }
            ]
        },
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/hdbank/build_payment_analytics_gold.py",
        ],
    ).get_results()
