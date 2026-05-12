import dagster as dg


@dg.asset(group_name="banking_bronze")
def bronze_transactions() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={"source": dg.MetadataValue.text("s3a://bronze/banking/transactions/raw/transactions.jsonl")}
    )
