import os
from pathlib import Path

CADDY_ROOT_CERT = Path.home() / "Library/Application Support/Caddy/pki/authorities/local/root.crt"

if CADDY_ROOT_CERT.exists():
    cert_path = str(CADDY_ROOT_CERT)
    os.environ.setdefault("SSL_CERT_FILE", cert_path)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_path)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)

import duckdb

UC_TOKEN = os.getenv("DUCKDB_UC_TOKEN", "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzUxMiIsImtpZCI6ImRkZmFhNzYyZGExNDgyZDQyNDVjM2FmZTZhZDBmMjczZjJmZmM0ZmUifQ.eyJzdWIiOiJhZG1pbiIsImlzcyI6ImludGVybmFsIiwiaWF0IjoxNzc4ODQxNzg0LCJqdGkiOiI0NTlkNTA3MS0zYjBmLTQ5MGMtYWIxMi1lYTEzZTk1YmE2NDMiLCJ0eXBlIjoiU0VSVklDRSJ9.d-H4TF-qkZb50GJjnxHiNnxTNBihx15d_0K8xfCBG1LWPTjLcCWnQwz0MRUqebIh2Yx59KlBy6sBRZ9YNb5cUOsxJ4Rf8tbcgOXUi88XOOghaGi6-NusyY8-AZLKnqwO2b01M2SU403oyJ0uoPAjYZEXk9l5MjoGnnXAnE4Q6FI5Bd6saZSHWyV89b5cLXNYJqbKbDd2tF5eqODu5ykmvbHzT0XAvscvg_-MJvT70LwPyk94MuwGPVxa-fBzxDj9eAKs2IyTxtVNiiAfVuLu7DQyFhbCNOanrpiD_14RM5u5-EoLTelkwH_K4cWKmylwQm7K5ekhU2GDvN86PjcJ3w")
UC_ENDPOINT = os.getenv("DUCKDB_UC_ENDPOINT", "http://localhost:8082")
UC_AWS_REGION = os.getenv("DUCKDB_UC_AWS_REGION", "us-east-1")
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:9000")
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_SCOPE = os.getenv("DUCKDB_S3_SCOPE", "s3://unitycatalog")

if not UC_TOKEN:
    raise RuntimeError("DUCKDB_UC_TOKEN is required")

endpoint_host = S3_ENDPOINT.replace("http://", "").replace("https://", "")
use_ssl = str(S3_ENDPOINT.startswith("https://")).lower()

duckdb.sql("INSTALL httpfs;")
duckdb.sql("INSTALL unity_catalog;")
duckdb.sql("LOAD httpfs;")
duckdb.sql("LOAD unity_catalog;")

duckdb.sql(f"""
CREATE SECRET (
    TYPE s3,
    KEY_ID '{S3_ACCESS_KEY}',
    SECRET '{S3_SECRET_KEY}',
    ENDPOINT '{endpoint_host}',
    USE_SSL {use_ssl},
    URL_STYLE 'path',
    REGION '{S3_REGION}',
    SCOPE '{S3_SCOPE}'
);
""")

duckdb.sql(f"""
CREATE SECRET(
    TYPE unity_catalog,
    TOKEN '{UC_TOKEN}',
    ENDPOINT '{UC_ENDPOINT}',
    AWS_REGION '{UC_AWS_REGION}'
);
""")

duckdb.sql("""
ATTACH 'hdbank' AS hdbank (TYPE unity_catalog, DEFAULT_SCHEMA 'hdbank_payments_prod_bronze');
""")

duckdb.sql("SHOW ALL TABLES;").show()
duckdb.sql("SELECT * FROM hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1;").show()
