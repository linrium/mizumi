import os

import duckdb

DELTA_PATH = os.getenv(
    "DUCKDB_DELTA_PATH",
    "s3://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/baggage_damage_classifications_v1",
)
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://127.0.0.1:9000")
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_REGION", "us-east-1")
PREVIEW_LIMIT = int(os.getenv("DUCKDB_PREVIEW_LIMIT", "20"))


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    con = duckdb.connect()
    con.execute("LOAD httpfs; LOAD delta;")

    endpoint_host = S3_ENDPOINT.replace("http://", "").replace("https://", "")
    use_ssl = str(S3_ENDPOINT.startswith("https://")).lower()
    create_s3_secret_sql = f"""
    CREATE OR REPLACE SECRET rustfs (
        TYPE s3,
        KEY_ID '{sql_quote(S3_ACCESS_KEY)}',
        SECRET '{sql_quote(S3_SECRET_KEY)}',
        ENDPOINT '{sql_quote(endpoint_host)}',
        USE_SSL {use_ssl},
        URL_STYLE 'path',
        REGION '{sql_quote(S3_REGION)}'
    )
    """
    con.execute(create_s3_secret_sql)

    count_query = f"SELECT COUNT(*) AS row_count FROM delta_scan('{sql_quote(DELTA_PATH)}')"
    preview_query = f"""
    SELECT damage_label, damage_score, image_uri
    FROM delta_scan('{sql_quote(DELTA_PATH)}')
    ORDER BY classified_at DESC, damage_score
    LIMIT {PREVIEW_LIMIT}
    """

    print(f"Previewing Delta table at {DELTA_PATH}")
    con.sql(count_query).show()
    con.sql(preview_query).show()


if __name__ == "__main__":
    main()
