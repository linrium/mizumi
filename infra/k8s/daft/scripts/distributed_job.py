# /// script
# dependencies = ["daft[deltalake]", "ray[client]==2.46.0"]
# ///
import daft
import ray
from daft.io import IOConfig, S3Config

SILVER_TRANSACTIONS = "s3://silver/banking/transactions"

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
    df = daft.read_deltalake(SILVER_TRANSACTIONS, io_config=IO_CONFIG)
    print(
        df.select("transaction_id", "account_id", "customer_id", "amount", "country_code", "channel")
        .limit(10)
        .collect()
    )


if __name__ == "__main__":
    main()
