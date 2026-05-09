import boto3
import dagster as dg
from dagster_k8s import PipesK8sClient
from dagster_spark import SparkPipelinesResource

PIPELINE_DIR = "/opt/spark/pipelines"

MEDALLION_SPEC  = f"{PIPELINE_DIR}/spark-pipeline.yaml"
CUSTOMER_SPEC   = f"{PIPELINE_DIR}/customer_pipeline/customer-pipeline.yaml"
WEEKLY_SPEC     = f"{PIPELINE_DIR}/weekly_pipeline/weekly-pipeline.yaml"

MEDALLION_DIR   = PIPELINE_DIR
CUSTOMER_DIR    = f"{PIPELINE_DIR}/customer_pipeline"
WEEKLY_DIR      = f"{PIPELINE_DIR}/weekly_pipeline"

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


def _purge_objects(context: dg.AssetExecutionContext, bucket: str, *prefixes: str) -> None:
    s3 = _s3_client()
    paginator = s3.get_paginator("list_objects_v2")
    for prefix in prefixes:
        deleted = 0
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if "Contents" in page:
                keys = [{"Key": obj["Key"]} for obj in page["Contents"]]
                s3.delete_objects(Bucket=bucket, Delete={"Objects": keys})
                deleted += len(keys)
        if deleted:
            context.log.info(f"Purged {deleted} objects from s3://{bucket}/{prefix}")


# ── Bronze (source placeholder) ───────────────────────────────────────────────

@dg.asset(group_name="bronze")
def bronze_orders() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"source": dg.MetadataValue.text("s3a://bronze/orders/raw/orders.jsonl")}
    )


# ── Silver via Dagster Pipes ───────────────────────────────────────────────────

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


# ── Gold via Dagster Pipes (read from Unity Catalog) ──────────────────────────

# Reads the Delta table produced by medallion_sdp via the mizumi UC catalog.
# UCSingleCatalog (which wraps Delta's SparkCatalog) only supports Delta format;
# the Parquet silver_orders table cannot be loaded through it.
@dg.asset(group_name="gold", deps=["sdp_silver_orders"], kinds={"spark"})
def gold_customer_stats(
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
            "/opt/spark/jobs/silver_to_gold_customer_stats.py",
        ],
    ).get_materialize_result()


@dg.asset(group_name="gold", deps=["sdp_silver_orders"], kinds={"spark"})
def gold_country_revenue(
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
            "/opt/spark/jobs/silver_to_gold_country_revenue.py",
        ],
    ).get_materialize_result()


# ── Medallion SDP ─────────────────────────────────────────────────────────────
# Runs first; its outputs gate the rest of the graph.

@dg.multi_asset(
    specs=[
        dg.AssetSpec("sdp_silver_orders",           group_name="sdp", deps=["bronze_orders"], kinds={"spark"}),
        dg.AssetSpec("sdp_gold_daily_country_sales", group_name="sdp", deps=["bronze_orders"], kinds={"spark"}),
    ],
)
def medallion_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    _purge_objects(context, "gold",
        "sdp-warehouse/silver_orders",
        "sdp-warehouse/gold_daily_country_sales",
        "pipeline/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=MEDALLION_SPEC,
        working_dir=MEDALLION_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_silver_orders")
    yield dg.MaterializeResult(asset_key="sdp_gold_daily_country_sales")


# ── Customer SDP ──────────────────────────────────────────────────────────────
# Declared dependency on sdp_silver_orders forces this to run after medallion_sdp,
# avoiding the Spark Connect port-15002 conflict that occurs when two embedded
# Spark Connect servers start in the same pod at the same time.

@dg.multi_asset(
    specs=[
        dg.AssetSpec("sdp_silver_customers",  group_name="sdp", deps=["bronze_orders", "sdp_silver_orders"], kinds={"spark"}),
        dg.AssetSpec("sdp_gold_customer_ltv", group_name="sdp", deps=["bronze_orders", "sdp_silver_orders"], kinds={"spark"}),
    ],
)
def customer_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    _purge_objects(context, "gold",
        "sdp-warehouse/silver_customers",
        "sdp-warehouse/gold_customer_ltv",
        "pipeline-customer/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=CUSTOMER_SPEC,
        working_dir=CUSTOMER_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_silver_customers")
    yield dg.MaterializeResult(asset_key="sdp_gold_customer_ltv")


# ── Weekly Trends SDP ─────────────────────────────────────────────────────────
# Sequenced after customer_sdp for the same port-conflict reason.

@dg.multi_asset(
    specs=[
        dg.AssetSpec("sdp_gold_weekly_revenue", group_name="sdp", deps=["bronze_orders", "sdp_gold_customer_ltv"], kinds={"spark"}),
        dg.AssetSpec("sdp_gold_weekly_growth",  group_name="sdp", deps=["bronze_orders", "sdp_gold_customer_ltv"], kinds={"spark"}),
    ],
)
def weekly_sdp(
    context: dg.AssetExecutionContext,
    spark_pipelines: SparkPipelinesResource,
):
    _purge_objects(context, "gold",
        "sdp-warehouse/gold_weekly_revenue",
        "sdp-warehouse/gold_weekly_growth",
        "pipeline-weekly/",
    )
    spark_pipelines.run_and_observe(
        context=context,
        pipeline_spec_path=WEEKLY_SPEC,
        working_dir=WEEKLY_DIR,
        execution_mode="full_refresh",
    )
    yield dg.MaterializeResult(asset_key="sdp_gold_weekly_revenue")
    yield dg.MaterializeResult(asset_key="sdp_gold_weekly_growth")


defs = dg.Definitions(
    assets=[
        bronze_orders,
        silver_orders,
        gold_customer_stats,
        gold_country_revenue,
        medallion_sdp,
        customer_sdp,
        weekly_sdp,
    ],
    resources={
        "pipes_k8s_client": PipesK8sClient(),
        "spark_pipelines": SparkPipelinesResource(
            spark_pipelines_cmd="spark-pipelines-s3",
        ),
    },
)
