# /// script
# dependencies = ["daft[deltalake]", "ray[client]==2.46.0"]
# ///
import daft
import ray
from daft.io import IOConfig, S3Config

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
    ray.init(runtime_env={"pip": ["daft[deltalake]"]})
    daft.set_runner_ray()
    df = daft.read_deltalake(SILVER_ORDERS, io_config=IO_CONFIG)
    print(df.select("order_id", "customer_id", "country_code", "gross_amount", "order_date").limit(10).collect())


if __name__ == "__main__":
    main()
