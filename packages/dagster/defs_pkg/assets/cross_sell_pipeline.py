import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import (
    DAFT_BAGGAGE_CLASSIFIER_IMAGE,
    DAFT_IMAGE,
    S3A_ACCESS_KEY,
    S3A_CONF,
    S3A_ENDPOINT,
    S3A_SECRET_KEY,
    SPARK_IMAGE,
)


def _run_spark_job(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
    job_path: str,
):
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "Always",
                }
            ]
        },
        command=["spark-submit", "--master", "local[*]", *S3A_CONF, job_path],
    )


@dg.asset(group_name="hdbank_bronze", kinds={"spark", "k8s"})
def hdbank_bronze_customers(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/build_bronze_customers.py",
    ).get_results()


@dg.asset(group_name="vietjetair_bronze", kinds={"spark", "k8s"})
def vietjetair_bronze_customers(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/vietjetair/build_bronze_customers.py",
    ).get_results()


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "hdbank_silver_customers",
            group_name="hdbank_silver",
            deps=["hdbank_bronze_customers"],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "hdbank_silver_travel_spend_features",
            group_name="hdbank_silver",
            deps=["hdbank_bronze_customers"],
            kinds={"spark", "k8s"},
        ),
    ],
)
def build_hdbank_silver(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/build_silver.py",
    ).get_results()


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "vietjetair_silver_customers",
            group_name="vietjetair_silver",
            deps=["vietjetair_bronze_customers"],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "vietjetair_silver_booking_features",
            group_name="vietjetair_silver",
            deps=["vietjetair_bronze_customers"],
            kinds={"spark", "k8s"},
        ),
    ],
)
def build_vietjetair_silver(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/vietjetair/build_silver.py",
    ).get_results()


@dg.asset(
    group_name="partnership_silver",
    deps=[
        "hdbank_silver_customers",
        "hdbank_silver_travel_spend_features",
        "vietjetair_silver_customers",
        "vietjetair_silver_booking_features",
    ],
    kinds={"spark", "k8s"},
)
def partnership_silver_customer_360(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/partnership/build_customer_360.py",
    ).get_results()


@dg.asset(
    group_name="hdbank_gold",
    deps=[
        "hdbank_silver_customers",
        "hdbank_silver_travel_spend_features",
        "vietjetair_silver_customers",
        "vietjetair_silver_booking_features",
    ],
    kinds={"spark", "k8s"},
)
def hdbank_gold_vietjet_activation_candidates(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/hdbank/build_gold_activation_candidates.py",
    ).get_results()


@dg.asset(
    group_name="vietjetair_gold",
    deps=[
        "hdbank_silver_customers",
        "vietjetair_silver_customers",
        "vietjetair_silver_booking_features",
    ],
    kinds={"spark", "k8s"},
)
def vietjetair_gold_hdbank_finance_candidates(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/vietjetair/build_gold_finance_candidates.py",
    ).get_results()


@dg.asset(
    group_name="partnership_gold",
    deps=[
        "hdbank_gold_vietjet_activation_candidates",
        "vietjetair_gold_hdbank_finance_candidates",
    ],
    kinds={"spark", "k8s"},
)
def partnership_gold_co_brand_offer_audience(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/partnership/build_gold_audience.py",
    ).get_results()


@dg.asset(
    group_name="partnership_gold",
    deps=["partnership_gold_co_brand_offer_audience"],
    kinds={"daft", "k8s"},
)
def partnership_gold_campaign_summary(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_IMAGE,
        base_pod_spec={
            "containers": [
                {"name": "dagster-pipes-execution", "imagePullPolicy": "Always"}
            ]
        },
        command=["python", "/opt/daft/jobs/co_brand_campaign_summary.py"],
    ).get_materialize_result()


@dg.asset(
    group_name="vietjetair_gold",
    kinds={"daft", "k8s"},
)
def vietjetair_gold_baggage_damage_classifications(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=DAFT_BAGGAGE_CLASSIFIER_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "Always",
                    "resources": {
                        "requests": {"cpu": "1", "memory": "2Gi"},
                        "limits": {"cpu": "2", "memory": "3Gi"},
                    },
                    "env": [
                        {"name": "RUSTFS_ENDPOINT_URL", "value": S3A_ENDPOINT},
                        {"name": "AWS_ACCESS_KEY_ID", "value": S3A_ACCESS_KEY},
                        {"name": "AWS_SECRET_ACCESS_KEY", "value": S3A_SECRET_KEY},
                    ],
                }
            ]
        },
        command=["python", "/opt/daft/jobs/vietjetair/classify_baggage_damage.py"],
    ).get_materialize_result()


cross_sell_daily_job = dg.define_asset_job(
    name="cross_sell_daily_job",
    selection=dg.AssetSelection.assets(
        "hdbank_bronze_customers",
        "vietjetair_bronze_customers",
        "hdbank_silver_customers",
        "hdbank_silver_travel_spend_features",
        "vietjetair_silver_customers",
        "vietjetair_silver_booking_features",
        "partnership_silver_customer_360",
        "hdbank_gold_vietjet_activation_candidates",
        "vietjetair_gold_hdbank_finance_candidates",
        "partnership_gold_co_brand_offer_audience",
        "partnership_gold_campaign_summary",
    ),
)

cross_sell_daily_schedule = dg.ScheduleDefinition(
    name="cross_sell_daily_schedule",
    cron_schedule="0 2 * * *",
    job=cross_sell_daily_job,
)
