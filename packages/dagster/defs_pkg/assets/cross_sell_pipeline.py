import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import DAFT_IMAGE, S3A_CONF, SPARK_IMAGE


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
                    "imagePullPolicy": "IfNotPresent",
                }
            ]
        },
        command=["spark-submit", "--master", "local[*]", *S3A_CONF, job_path],
    )


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "hdbank_bronze_partner_events",
            group_name="hdbank_bronze",
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "vietjetair_bronze_partner_events",
            group_name="vietjetair_bronze",
            kinds={"spark", "k8s"},
        ),
    ],
    can_subset=False,
)
def seed_partner_bronze_events(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/seed_co_brand_demo_bronze.py",
    ).get_results()


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "hdbank_silver_customers",
            group_name="hdbank_silver",
            deps=["hdbank_bronze_partner_events"],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "hdbank_silver_travel_spend_features",
            group_name="hdbank_silver",
            deps=["hdbank_bronze_partner_events"],
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
            deps=["vietjetair_bronze_partner_events"],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "vietjetair_silver_booking_features",
            group_name="vietjetair_silver",
            deps=["vietjetair_bronze_partner_events"],
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


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "hdbank_gold_vietjet_activation_candidates",
            group_name="hdbank_gold",
            deps=[
                "hdbank_silver_customers",
                "hdbank_silver_travel_spend_features",
                "vietjetair_silver_customers",
            ],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "vietjetair_gold_hdbank_finance_candidates",
            group_name="vietjetair_gold",
            deps=[
                "vietjetair_silver_customers",
                "vietjetair_silver_booking_features",
                "hdbank_silver_customers",
            ],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "partnership_gold_co_brand_offer_audience",
            group_name="partnership_gold",
            deps=[
                "hdbank_silver_customers",
                "hdbank_silver_travel_spend_features",
                "vietjetair_silver_customers",
                "vietjetair_silver_booking_features",
            ],
            kinds={"spark", "k8s"},
        ),
    ],
)
def build_gold_cross_sell(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/build_gold_cross_sell.py",
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


cross_sell_daily_job = dg.define_asset_job(
    name="cross_sell_daily_job",
    selection=dg.AssetSelection.assets(
        "hdbank_bronze_partner_events",
        "vietjetair_bronze_partner_events",
        "hdbank_silver_customers",
        "hdbank_silver_travel_spend_features",
        "vietjetair_silver_customers",
        "vietjetair_silver_booking_features",
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
