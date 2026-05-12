import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import DAFT_IMAGE, DAFT_RAY_ADDRESS


@dg.asset(
    group_name="banking_gold",
    deps=["banking_sdp_silver_transactions"],
    kinds={"daft", "k8s"},
)
def banking_gold_customer_risk_scores(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        command=["python", "/opt/daft/jobs/banking_risk_score_job.py"],
    ).get_materialize_result()


@dg.asset(
    group_name="banking_gold",
    deps=["banking_sdp_silver_transactions"],
    kinds={"daft", "k8s", "ray"},
)
def banking_gold_fraud_pattern_analysis(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        command=[
            "python",
            "/opt/daft/jobs/banking_fraud_analysis_job.py",
            "--ray-address",
            DAFT_RAY_ADDRESS,
        ],
    ).get_materialize_result()
