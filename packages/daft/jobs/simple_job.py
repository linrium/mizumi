# /// script
# dependencies = ["daft[deltalake]"]
# ///
import daft
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
    with open_dagster_pipes() as pipes:
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
            }
        )


if __name__ == "__main__":
    main()
