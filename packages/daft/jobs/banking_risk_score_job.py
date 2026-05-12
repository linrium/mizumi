# /// script
# dependencies = ["daft[deltalake]"]
# ///
import daft
import daft.expressions as col
import deltalake
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes

SILVER_TRANSACTIONS = "s3://silver/banking/streaming"
TARGET_PATH = "s3://gold/banking/customer_risk_scores"

S3_STORAGE_OPTIONS = {
    "endpoint_url": "http://rustfs-svc.rustfs.svc.cluster.local:9000",
    "aws_access_key_id": "rustfsadmin",
    "aws_secret_access_key": "rustfsadmin",
    "aws_allow_http": "true",
    "allow_unsafe_rename": "true",
}

IO_CONFIG = IOConfig(
    s3=S3Config(
        endpoint_url="http://rustfs-svc.rustfs.svc.cluster.local:9000",
        key_id="rustfsadmin",
        access_key="rustfsadmin",
        use_ssl=False,
    )
)


def main() -> None:
    with open_dagster_pipes() as pipes:
        df = daft.read_deltalake(SILVER_TRANSACTIONS, io_config=IO_CONFIG)

        per_customer = (
            df.groupby("customer_id")
            .agg(
                col.col("transaction_id").count().alias("tx_count"),
                col.col("amount").sum().alias("total_volume"),
                col.col("amount").mean().alias("avg_amount"),
                col.col("country_code").count_distinct().alias("country_count"),
                col.col("account_id").count_distinct().alias("account_count"),
            )
        )

        risk_scored = per_customer.with_column(
            "risk_tier",
            daft.col("total_volume").apply(
                lambda v: (
                    "CRITICAL" if v >= 500_000
                    else "HIGH" if v >= 100_000
                    else "MEDIUM" if v >= 10_000
                    else "LOW"
                ),
                return_dtype=daft.DataType.string(),
            ),
        )

        row_count = risk_scored.count_rows()
        preview = (
            risk_scored.select("customer_id", "tx_count", "total_volume", "country_count", "risk_tier")
            .limit(5)
            .to_pydict()
        )

        # Collect to PyArrow and write via deltalake directly to avoid daft 0.7.10 AddAction.size bug
        arrow_table = risk_scored.to_arrow()
        deltalake.write_deltalake(
            TARGET_PATH,
            arrow_table,
            storage_options=S3_STORAGE_OPTIONS,
            mode="overwrite",
        )

        pipes.report_asset_materialization(
            metadata={
                "row_count": row_count,
                "preview": [
                    {k: str(preview[k][i]) for k in preview}
                    for i in range(len(preview["customer_id"]))
                ],
                "source": SILVER_TRANSACTIONS,
                "target": TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
