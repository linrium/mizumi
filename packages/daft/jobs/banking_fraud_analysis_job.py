# /// script
# dependencies = ["daft[deltalake]", "ray[client]==2.46.0"]
# ///
import argparse

import daft
import daft.expressions as col
import ray
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes

SILVER_TRANSACTIONS = "s3://silver/banking/streaming"
TARGET_PATH = "s3://gold/banking/fraud_pattern_analysis"

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
            .with_column("transaction_date", daft.col("timestamp").cast(daft.DataType.date()))
        )

        # Detect structuring: customers with multiple transactions just below $10k threshold in same day
        structuring = (
            all_txns.where(
                (daft.col("amount") >= 8000) & (daft.col("amount") < 10000)
                & (daft.col("transaction_type").is_in(["DEBIT", "TRANSFER"]))
            )
            .groupby("customer_id", "transaction_date")
            .agg(
                col.col("transaction_id").count().alias("near_threshold_count"),
                col.col("amount").sum().alias("near_threshold_total"),
                col.col("account_id").count_distinct().alias("accounts_used"),
            )
            .where(daft.col("near_threshold_count") >= 3)
            .with_column("pattern_type", daft.lit("STRUCTURING"))
        )

        # Detect cross-border anomalies: same customer, multiple countries in 24h
        cross_border = (
            all_txns.groupby("customer_id", "transaction_date")
            .agg(
                col.col("country_code").count_distinct().alias("countries_in_day"),
                col.col("transaction_id").count().alias("tx_count"),
                col.col("amount").sum().alias("total_amount"),
                col.col("account_id").count_distinct().alias("accounts_used"),
            )
            .where(daft.col("countries_in_day") >= 3)
            .with_column("pattern_type", daft.lit("CROSS_BORDER_ANOMALY"))
            .with_column("near_threshold_count", daft.col("tx_count"))
            .with_column("near_threshold_total", daft.col("total_amount"))
        )

        combined = structuring.select(
            "customer_id", "transaction_date", "pattern_type",
            "near_threshold_count", "near_threshold_total", "accounts_used",
        ).concat(
            cross_border.select(
                "customer_id", "transaction_date", "pattern_type",
                "near_threshold_count", "near_threshold_total", "accounts_used",
            )
        )

        row_count = combined.count_rows()
        preview = combined.limit(5).to_pydict()

        combined.write_parquet(TARGET_PATH, io_config=IO_CONFIG)

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
