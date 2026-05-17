import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import DAFT_IMAGE


@dg.asset(
    group_name="banking_gold",
    deps=["banking_silver_card_payment_events"],
    kinds={"daft", "k8s"},
)
def banking_gold_customer_risk_scores(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        base_pod_spec={"containers": [{"name": "dagster-pipes-execution", "imagePullPolicy": "IfNotPresent"}]},
        command=["python", "/opt/daft/jobs/banking_risk_score_job.py"],
    ).get_materialize_result()


@dg.asset(
    group_name="banking_gold",
    deps=["banking_silver_card_payment_events"],
    kinds={"daft", "k8s"},
)
def banking_gold_fraud_pattern_analysis(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        base_pod_spec={"containers": [{"name": "dagster-pipes-execution", "imagePullPolicy": "IfNotPresent"}]},
        command=["python", "/opt/daft/jobs/banking_fraud_analysis_job.py"],
    ).get_materialize_result()
