import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import S3A_CONF, SPARK_IMAGE


@dg.asset(
    group_name="sandbox",
    kinds={"spark", "k8s"},
)
def sandbox_seed_data(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "Never",
                    "resources": {
                        "requests": {"memory": "4Gi", "cpu": "2"},
                        "limits": {"memory": "4Gi", "cpu": "2"},
                    },
                }
            ]
        },
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            "--driver-memory",
            "3g",
            *S3A_CONF,
            "/opt/spark/jobs/sandbox/generate_sandbox_seed_data.py",
        ],
    ).get_materialize_result()
