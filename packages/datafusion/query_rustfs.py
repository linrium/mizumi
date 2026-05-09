import os

from datafusion import SessionContext
from datafusion.object_store import AmazonS3


BUCKET = os.getenv("RUSTFS_BUCKET", "silver")
REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
ENDPOINT = os.getenv(
    "AWS_ENDPOINT_URL",
    "http://rustfs-svc.rustfs.svc.cluster.local:9000",
)
ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
PARQUET_PATH = os.getenv("RUSTFS_PARQUET_PATH", f"s3://{BUCKET}/orders/silver_orders/")


def main() -> None:
    ctx = SessionContext()
    s3 = AmazonS3(
        bucket_name=BUCKET,
        region=REGION,
        access_key_id=ACCESS_KEY,
        secret_access_key=SECRET_KEY,
        endpoint=ENDPOINT,
        allow_http=True,
    )

    # The official DataFusion Python object store pattern is:
    # register an object store, then register/query Parquet via s3:// paths.
    ctx.register_object_store("s3://", s3, None)
    ctx.register_parquet("silver_orders", PARQUET_PATH)

    query = """
        SELECT
            country_code,
            COUNT(*) AS order_count,
            ROUND(SUM(gross_amount), 2) AS total_revenue
        FROM silver_orders
        GROUP BY country_code
        ORDER BY total_revenue DESC
    """
    df = ctx.sql(query)
    df.show()

    arrow_table = df.to_arrow_table()
    print("Arrow schema:", arrow_table.schema)
    print("Arrow rows:", arrow_table.num_rows)


if __name__ == "__main__":
    main()
