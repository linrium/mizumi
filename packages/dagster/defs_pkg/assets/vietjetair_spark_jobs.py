import dagster as dg
from dagster_k8s import PipesK8sClient

from ..config import S3A_CONF, SPARK_IMAGE


def _run_spark_job(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
    job_path: str,
) -> dg.MaterializeResult:
    return pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "Never",
                }
            ]
        },
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            job_path,
        ],
    ).get_materialize_result()


@dg.asset(
    group_name="vietjetair_silver",
    deps=["vietjetair_bronze_raw_flight_events"],
    kinds={"spark", "k8s"},
)
def vietjetair_silver_flights(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/vietjetair/build_flights_silver.py",
    )


@dg.asset(
    group_name="vietjetair_silver",
    deps=["vietjetair_bronze_raw_customer_events"],
    kinds={"spark", "k8s"},
)
def vietjetair_silver_customers(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/vietjetair/build_customers_silver.py",
    )


@dg.asset(
    group_name="vietjetair_silver",
    deps=["vietjetair_bronze_raw_booking_events"],
    kinds={"spark", "k8s"},
)
def vietjetair_silver_ticket_bookings(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
) -> dg.MaterializeResult:
    return _run_spark_job(
        context,
        pipes_k8s_client,
        "/opt/spark/jobs/vietjetair/build_ticket_bookings_silver.py",
    )


@dg.multi_asset(
    specs=[
        dg.AssetSpec(
            "vietjetair_gold_booking_revenue",
            group_name="vietjetair_gold",
            deps=[
                "vietjetair_silver_ticket_bookings",
                "vietjetair_silver_customers",
                "vietjetair_silver_flights",
            ],
            kinds={"spark", "k8s"},
        ),
        dg.AssetSpec(
            "vietjetair_gold_customer_spend",
            group_name="vietjetair_gold",
            deps=[
                "vietjetair_silver_ticket_bookings",
                "vietjetair_silver_customers",
            ],
            kinds={"spark", "k8s"},
        ),
    ],
)
def vietjetair_gold_booking_analytics(
    context: dg.AssetExecutionContext,
    pipes_k8s_client: PipesK8sClient,
):
    yield from pipes_k8s_client.run(
        context=context,
        image=SPARK_IMAGE,
        base_pod_spec={
            "containers": [
                {
                    "name": "dagster-pipes-execution",
                    "imagePullPolicy": "Never",
                }
            ]
        },
        command=[
            "spark-submit",
            "--master",
            "local[*]",
            *S3A_CONF,
            "/opt/spark/jobs/vietjetair/build_booking_analytics_gold.py",
        ],
    ).get_results()
