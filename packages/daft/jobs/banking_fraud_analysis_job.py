# /// script
# dependencies = ["daft[deltalake]", "ray[client]==2.46.0"]
# ///
import argparse

import daft
import daft.expressions as col
import deltalake
import ray
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes

SILVER_TRANSACTIONS = "s3://unitycatalog/hdbank/hdbank_payments_prod_silver/card_payment_events_v1"
TARGET_PATH = "s3://unitycatalog/hdbank/hdbank_payments_prod_gold/fraud_pattern_analysis"

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
    parser = argparse.ArgumentParser()
    parser.add_argument("--ray-address", required=True)
    args = parser.parse_args()

    with open_dagster_pipes() as pipes:
        ray.init(args.ray_address, runtime_env={"pip": ["daft[deltalake]==0.7.10"]})
        daft.set_runner_ray(args.ray_address)

        all_txns = (
            daft.read_deltalake(SILVER_TRANSACTIONS, io_config=IO_CONFIG)
            .with_column("transaction_date", daft.col("payment_timestamp").cast(daft.DataType.date()))
        )

        # Detect structuring: customers with 3+ transactions just below $10k threshold in same day
        structuring = (
            all_txns.where(
                (daft.col("amount") >= 8000) & (daft.col("amount") < 10000)
            )
            .groupby("customer_id", "transaction_date")
            .agg(
                col.col("payment_event_id").count().alias("near_threshold_count"),
                col.col("amount").sum().alias("near_threshold_total"),
                col.col("account_id").count_distinct().alias("accounts_used"),
            )
            .where(daft.col("near_threshold_count") >= 3)
            .with_column("pattern_type", daft.lit("STRUCTURING"))
        )

        # Detect multi-account anomalies: same customer using 3+ distinct accounts in a single day
        multi_account = (
            all_txns.groupby("customer_id", "transaction_date")
            .agg(
                col.col("account_id").count_distinct().alias("accounts_used"),
                col.col("payment_event_id").count().alias("tx_count"),
                col.col("amount").sum().alias("total_amount"),
            )
            .where(daft.col("accounts_used") >= 3)
            .with_column("pattern_type", daft.lit("MULTI_ACCOUNT_ANOMALY"))
            .with_column("near_threshold_count", daft.col("tx_count"))
            .with_column("near_threshold_total", daft.col("total_amount"))
        )

        combined = structuring.select(
            "customer_id", "transaction_date", "pattern_type",
            "near_threshold_count", "near_threshold_total", "accounts_used",
        ).concat(
            multi_account.select(
                "customer_id", "transaction_date", "pattern_type",
                "near_threshold_count", "near_threshold_total", "accounts_used",
            )
        )

        row_count = combined.count_rows()
        preview = combined.limit(5).to_pydict()

        # Collect to PyArrow and write via deltalake directly to avoid daft 0.7.10 AddAction.size bug
        arrow_table = combined.to_arrow()
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
                "ray_address": args.ray_address,
            }
        )


if __name__ == "__main__":
    main()
