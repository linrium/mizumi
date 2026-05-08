import boto3
import dagster as dg
from dagster_k8s import PipesK8sClient
from dagster_spark import SparkPipelinesResource

PIPELINE_SPEC = "/opt/spark/pipelines/spark-pipeline.yaml"
PIPELINE_DIR = "/opt/spark/pipelines"
S3A_ENDPOINT = "http://rustfs-svc.rustfs.svc.cluster.local:9000"
S3A_ACCESS_KEY = "rustfsadmin"
S3A_SECRET_KEY = "rustfsadmin"

S3A_CONF = [
    "--conf", "spark.hadoop.fs.s3a.impl=org.apache.hadoop.fs.s3a.S3AFileSystem",
    "--conf", f"spark.hadoop.fs.s3a.endpoint={S3A_ENDPOINT}",
    "--conf", "spark.hadoop.fs.s3a.path.style.access=true",
    "--conf", f"spark.hadoop.fs.s3a.access.key={S3A_ACCESS_KEY}",
    "--conf", f"spark.hadoop.fs.s3a.secret.key={S3A_SECRET_KEY}",
    "--conf", "spark.hadoop.fs.s3a.connection.ssl.enabled=false",
    "--conf", "spark.hadoop.fs.s3a.aws.credentials.provider=org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider",
]


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3A_ENDPOINT,
        aws_access_key_id=S3A_ACCESS_KEY,
        aws_secret_access_key=S3A_SECRET_KEY,
    )


def _purge_sdp(context: dg.AssetExecutionContext) -> None:
    """Delete sdp-warehouse data and pipeline state so full_refresh starts clean."""
    s3 = _s3_client()
    paginator = s3.get_paginator("list_objects_v2")
    for prefix in ("sdp-warehouse/", "pipeline/"):
        deleted = 0
        for page in paginator.paginate(Bucket="gold", Prefix=prefix):
            if "Contents" in page:
                keys = [{"Key": obj["Key"]} for obj in page["Contents"]]
                s3.delete_objects(Bucket="gold", Delete={"Objects": keys})
                deleted += len(keys)
        if deleted:
            context.log.info(f"Purged {deleted} objects from s3://gold/{prefix}")


# ── Bronze (source placeholder) ───────────────────────────────────────────────

@dg.asset(group_name="bronze")
def bronze_orders() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"source": dg.MetadataValue.text("s3a://bronze/orders/raw/orders.jsonl")}
    )


# ── Silver via Dagster Pipes ───────────────────────────────────────────────────
# PipesK8sClient creates a K8s Job running spark-submit in local mode.
# The script reports row counts back via pod-log message writer.

@dg.asset(group_name="silver", deps=[bronze_orders], kinds={"spark"})
def silver_orders(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image="mizumi-spark-rustfs:4.1.1",
        command=[
            "spark-submit",
            "--master", "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/bronze_to_silver.py",
        ],
    ).get_materialize_result()


# ── Medallion via Spark Declarative Pipelines ─────────────────────────────────
# SparkPipelinesResource runs spark-pipelines-s3 (wrapper that prepends --jars)
# as a subprocess in the Dagster pod and streams logs to the run UI.
# sdp-warehouse and pipeline state are purged before each run so full_refresh
# always starts from a clean slate (avoids LOCATION_ALREADY_EXISTS).

@dg.multi_asset(
    specs=[
        dg.AssetSpec("sdp_silver_orders", group_name="sdp", deps=["bronze_orders"], kinds={"spark"}),
        dg.AssetSpec("sdp_gold_daily_country_sales", group_name="sdp", deps=["bronze_orders"], kinds={"spark"}),
    ],
)
def medallion_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    _purge_sdp(context)
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=PIPELINE_SPEC,
        working_dir=PIPELINE_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_silver_orders")
    yield dg.MaterializeResult(asset_key="sdp_gold_daily_country_sales")


defs = dg.Definitions(
    assets=[bronze_orders, silver_orders, medallion_sdp],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
        "spark_pipelines": SparkPipelinesResource(
            spark_pipelines_cmd="spark-pipelines-s3",
        ),
    },
)
