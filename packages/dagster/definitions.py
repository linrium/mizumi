import dagster as dg


@dg.asset(group_name="bronze")
def bronze_orders() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"source": dg.MetadataValue.text("s3a://bronze/orders/raw/orders.jsonl")}
    )


@dg.asset(group_name="silver", deps=[bronze_orders])
def silver_orders() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"destination": dg.MetadataValue.text("s3a://silver/orders/silver_orders")}
    )


@dg.asset(group_name="gold", deps=[silver_orders])
def gold_daily_country_sales() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"destination": dg.MetadataValue.text("s3a://gold/warehouse/default/gold_daily_country_sales")}
    )


defs = dg.Definitions(
    assets=[bronze_orders, silver_orders, gold_daily_country_sales],
)
