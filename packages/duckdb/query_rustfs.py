import os

import duckdb

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
DELTA_PATH = os.getenv("DUCKDB_DELTA_PATH", "s3://gold/sdp-warehouse/silver_orders")


def main() -> None:
    con = duckdb.connect()
    con.execute("LOAD httpfs; LOAD delta;")

    endpoint_host = ENDPOINT.replace("http://", "").replace("https://", "")
    con.execute(f"""
        CREATE SECRET rustfs (
            TYPE S3,
            KEY_ID '{ACCESS_KEY}',
            SECRET '{SECRET_KEY}',
            ENDPOINT '{endpoint_host}',
            USE_SSL false,
            URL_STYLE 'path',
            REGION 'us-east-1'
        )
    """)

    result = con.execute(f"""
        SELECT
            country_code,
            COUNT(*) AS order_count,
            ROUND(SUM(gross_amount), 2) AS total_revenue
        FROM delta_scan('{DELTA_PATH}')
        GROUP BY country_code
        ORDER BY total_revenue DESC
    """).fetchdf()

    print(result.to_string())


if __name__ == "__main__":
    main()
