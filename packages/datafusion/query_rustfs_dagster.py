import os

from dagster_pipes import open_dagster_pipes
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
    with open_dagster_pipes() as pipes:
        ctx = SessionContext()
        s3 = AmazonS3(
            bucket_name=BUCKET,
            region=REGION,
            access_key_id=ACCESS_KEY,
            secret_access_key=SECRET_KEY,
            endpoint=ENDPOINT,
            allow_http=True,
        )

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
        arrow_table = df.to_arrow_table()

        preview = [
            {
                "country_code": arrow_table.column("country_code")[idx].as_py(),
                "order_count": arrow_table.column("order_count")[idx].as_py(),
                "total_revenue": arrow_table.column("total_revenue")[idx].as_py(),
            }
            for idx in range(min(5, arrow_table.num_rows))
        ]

        pipes.report_asset_materialization(
            metadata={
                "source": PARQUET_PATH,
                "row_count": arrow_table.num_rows,
                "schema": str(arrow_table.schema),
                "preview": preview,
            }
        )


if __name__ == "__main__":
    main()
