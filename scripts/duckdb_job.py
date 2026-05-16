import os
from pathlib import Path

CADDY_ROOT_CERT = Path.home() / "Library/Application Support/Caddy/pki/authorities/local/root.crt"

if CADDY_ROOT_CERT.exists():
    cert_path = str(CADDY_ROOT_CERT)
    os.environ.setdefault("SSL_CERT_FILE", cert_path)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_path)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)

import duckdb

UC_TOKEN = os.getenv("DUCKDB_UC_TOKEN", "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJCTTNIdFJmRGhBQVQ4cDhOdHRNVmN2Ym5xNUNtNnB2RUp4Q1hZVUhXYW1nIn0.eyJleHAiOjE3Nzg4OTY2NjEsImlhdCI6MTc3ODg5NjM2MSwiYXV0aF90aW1lIjoxNzc4ODkzOTkzLCJqdGkiOiIwMzU5OTgwYS1mOWMzLWQwMzctNDNmOC0wMzIyZGM0YjYwNjYiLCJpc3MiOiJodHRwOi8va2V5Y2xvYWstc3ZjLmtleWNsb2FrLnN2Yy5jbHVzdGVyLmxvY2FsOjgwODAvcmVhbG1zL3NvdmljbyIsImF1ZCI6IndlYnVpIiwic3ViIjoiZjhiMjQyMDktOTYzOS00ODIxLTg3NzctN2FiNDRiMWI5M2VmIiwidHlwIjoiSUQiLCJhenAiOiJ3ZWJ1aSIsInNpZCI6IjViMDgyMTQ3LTZlYzYtNDY3Ny1hOGFkLWY4YWVmNWM0NWFjNyIsImF0X2hhc2giOiJvSzBKd3BsRnZCVlFNNDhibng3T0ZRIiwiYWNyIjoiMSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoiS2hhbyBTb2kiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJraGFvc29pQGdtYWlsLmNvbSIsImdpdmVuX25hbWUiOiJLaGFvIiwiZmFtaWx5X25hbWUiOiJTb2kiLCJlbWFpbCI6ImtoYW9zb2lAZ21haWwuY29tIn0.DjRgybLqrlgs3_P8ElnyOH6jZUFTNhgf8RlmnHJzaGbIbY1ZBHZ4r2S3FqIARqq33SwiuQevboJ_fPTU76h176oy-xTL8LAH0lI8BjVyJypGSnVblQu_DZBiEfm1_BppaGIUSJqbfE6q400_9tqixuHB6gAA91a-6jDKtOJ-rXwMAHKZkPpEkuvitXGErEX6jypV8C1MQsRavUKt9qLQsp_vTfQwEKuBqEPironsl5Nr5RBkyYzaIm-gqwsf795wjCEjB4V2-ee_n8NlR97ne2t7c8X0FNn6IER4htmvO3sd0TazzTNWi8VU9U2qkk3qXo9wwllcfm69483aY3UMhQ")
UC_ENDPOINT = os.getenv("DUCKDB_UC_ENDPOINT", "http://localhost:8082")
UC_AWS_REGION = os.getenv("DUCKDB_UC_AWS_REGION", "us-east-1")

if not UC_TOKEN:
    raise RuntimeError("DUCKDB_UC_TOKEN is required")

duckdb.sql("INSTALL unity_catalog;")
duckdb.sql("LOAD unity_catalog;")

duckdb.sql(f"""
CREATE SECRET(
    TYPE unity_catalog,
    TOKEN '{UC_TOKEN}',
    ENDPOINT '{UC_ENDPOINT}',
    AWS_REGION '{UC_AWS_REGION}'
);
""")

duckdb.sql("""
ATTACH 'hdbank' AS hdbank (TYPE unity_catalog, READ_ONLY, DEFAULT_SCHEMA 'hdbank_payments_prod_bronze');
""")

duckdb.sql("SHOW ALL TABLES;").show()
duckdb.sql("SELECT * FROM hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1;").show()
