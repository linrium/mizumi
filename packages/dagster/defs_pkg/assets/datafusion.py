import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import DATAFUSION_IMAGE


@dg.asset(group_name="datafusion", deps=["silver_orders"], kinds={"datafusion", "k8s", "arrow"})
def datafusion_rustfs_query(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DATAFUSION_IMAGE,
        command=["python", "/opt/datafusion/query_rustfs_dagster.py"],
    ).get_materialize_result()
