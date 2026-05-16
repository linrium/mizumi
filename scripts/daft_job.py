import daft
import daft.expressions as col
import deltalake
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes

SILVER_TRANSACTIONS = "s3://unitycatalog/hdbank/hdbank_payments_prod_silver/card_payment_events_v1"
TARGET_PATH = "s3://unitycatalog/hdbank/hdbank_payments_prod_gold/risk_detection_v1"

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

df = daft.read_deltalake(SILVER_TRANSACTIONS, io_config=IO_CONFIG)
df.show()