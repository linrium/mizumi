import json
import os
import sys
from pathlib import Path

CADDY_ROOT_CERT = Path.home() / "Library/Application Support/Caddy/pki/authorities/local/root.crt"
CLUSTER_PROXY_CERT = Path(
    os.getenv("DUCKDB_CA_CERT_PATH", "/etc/rustfs-s3-proxy/tls.crt")
)

if CADDY_ROOT_CERT.exists():
    cert_path = str(CADDY_ROOT_CERT)
    os.environ.setdefault("SSL_CERT_FILE", cert_path)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_path)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)

import duckdb

SQL = os.getenv("DUCKDB_QUERY", "")
UC_ENDPOINT = os.getenv(
    "DUCKDB_UC_ENDPOINT",
    "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080",
)
UC_TOKEN = os.getenv("DUCKDB_UC_TOKEN", "no-token")
UC_AWS_REGION = os.getenv("DUCKDB_UC_AWS_REGION", "us-east-1")
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_SCOPE = os.getenv("DUCKDB_S3_SCOPE", "s3://unitycatalog")

# Keep this aligned with infra/k8s/unitycatalog/bootstrap-job.yaml.
CATALOG_DEFAULT_SCHEMAS = {
    "hdbank": "hdbank_partnership_prod_bronze",
    "vietjetair": "vietjetair_partnership_prod_bronze",
    "partnership": "co_brand_silver",
}


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def debug_log(message: str, **fields: object) -> None:
    payload = {"message": message, **fields}
    print(json.dumps(payload, default=str), file=sys.stderr, flush=True)


def main() -> None:
    debug_log(
        "Starting DuckDB query API",
        uc_endpoint=UC_ENDPOINT,
        query=SQL,
    )

    if not SQL:
        print(json.dumps({"error": "DUCKDB_QUERY environment variable not set"}))
        sys.exit(1)

    if not UC_TOKEN:
        print(json.dumps({"error": "DUCKDB_UC_TOKEN environment variable not set"}))
        sys.exit(1)

    try:
        con = duckdb.connect()
        debug_log("Connected to DuckDB")

        debug_log("Loading DuckDB extensions", extensions=["httpfs", "delta", "unity_catalog"])
        con.execute("LOAD httpfs; LOAD delta; LOAD unity_catalog;")

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
        debug_log("Creating S3 secret for UC storage", sql=create_s3_secret_sql)
        con.execute(create_s3_secret_sql)

        create_secret_sql = f"""
        CREATE SECRET(
            TYPE unity_catalog,
            TOKEN '{sql_quote(UC_TOKEN)}',
            ENDPOINT '{sql_quote(UC_ENDPOINT)}',
            AWS_REGION '{sql_quote(UC_AWS_REGION)}'
        )
        """
        debug_log(
            "Creating Unity Catalog secret",
            endpoint=UC_ENDPOINT,
            aws_region=UC_AWS_REGION,
        )
        con.execute(create_secret_sql)

        for catalog, default_schema in CATALOG_DEFAULT_SCHEMAS.items():
            attach_sql = f"""
            ATTACH '{catalog}' AS {catalog} (
                TYPE unity_catalog,
                DEFAULT_SCHEMA '{default_schema}',
                READ_ONLY
            )
            """
            debug_log(
                "Attaching Unity Catalog catalog",
                catalog=catalog,
                default_schema=default_schema,
                sql=attach_sql,
            )
            con.execute(attach_sql)

        debug_log("Executing query", sql=SQL)
        result = con.execute(SQL).fetchdf()
        debug_log(
            "Query execution finished",
            row_count=len(result),
            columns=list(result.columns),
        )

        output = {
            "columns": list(result.columns),
            "rows": result.values.tolist(),
            "row_count": len(result),
        }

        print(json.dumps(output, default=str))
    except Exception as exc:
        debug_log("Query execution failed", error=str(exc))
        raise


if __name__ == "__main__":
    main()
