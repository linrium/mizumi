# /// script
# dependencies = ["daft[deltalake]", "ray[client]==2.46.0"]
# ///
import argparse

import daft
import ray
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes

SILVER_ORDERS = "s3://silver/orders/silver_orders"

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

        df = daft.read_deltalake(SILVER_ORDERS, io_config=IO_CONFIG)
        row_count = df.count_rows()
        preview = (
            df.select("order_id", "customer_id", "country_code", "gross_amount", "order_date")
            .limit(3)
            .to_pydict()
        )
        pipes.report_asset_materialization(
            metadata={
                "row_count": row_count,
                "preview": [
                    {k: str(preview[k][i]) for k in preview}
                    for i in range(len(preview["order_id"]))
                ],
                "source": SILVER_ORDERS,
                "ray_address": args.ray_address,
            }
        )


if __name__ == "__main__":
    main()
