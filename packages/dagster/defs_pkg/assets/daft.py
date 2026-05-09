import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import DAFT_IMAGE, DAFT_RAY_ADDRESS


@dg.asset(group_name="daft", kinds={"daft", "k8s"})
def daft_simple_job(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        command=["python", "/opt/daft/jobs/simple_job.py"],
    ).get_materialize_result()


@dg.asset(group_name="daft", kinds={"daft", "k8s", "ray"})
def daft_distributed_job(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        command=[
            "python",
            "/opt/daft/jobs/distributed_job.py",
            "--ray-address",
            DAFT_RAY_ADDRESS,
        ],
    ).get_materialize_result()
