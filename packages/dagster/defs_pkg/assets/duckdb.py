import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import DUCKDB_IMAGE


@dg.asset(group_name="duckdb", deps=["medallion_sdp"], kinds={"duckdb", "k8s", "delta"})
def duckdb_delta_query(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DUCKDB_IMAGE,
        command=["python", "/opt/duckdb/query_rustfs_dagster.py"],
    ).get_materialize_result()
