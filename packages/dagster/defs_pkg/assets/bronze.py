import dagster as dg


@dg.asset(group_name="bronze")
def bronze_orders() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"source": dg.MetadataValue.text("s3a://bronze/orders/raw/orders.jsonl")}
    )
