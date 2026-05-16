import os
from pathlib import Path

CADDY_ROOT_CERT = Path.home() / "Library/Application Support/Caddy/pki/authorities/local/root.crt"

if CADDY_ROOT_CERT.exists():
    cert_path = str(CADDY_ROOT_CERT)
    os.environ.setdefault("SSL_CERT_FILE", cert_path)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_path)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)

import duckdb

UC_TOKEN = os.getenv("DUCKDB_UC_TOKEN", "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJCTTNIdFJmRGhBQVQ4cDhOdHRNVmN2Ym5xNUNtNnB2RUp4Q1hZVUhXYW1nIn0.eyJleHAiOjE3Nzg5MzY4MDQsImlhdCI6MTc3ODkzNjUwNCwiYXV0aF90aW1lIjoxNzc4OTMxMzE0LCJqdGkiOiJlN2E5NGQzYS0yZDg5LTBkMmMtMGMzZC1lYmE3ZTJlZGU4MmQiLCJpc3MiOiJodHRwOi8va2V5Y2xvYWstc3ZjLmtleWNsb2FrLnN2Yy5jbHVzdGVyLmxvY2FsOjgwODAvcmVhbG1zL3NvdmljbyIsImF1ZCI6IndlYnVpIiwic3ViIjoiYjNjZDQyOTQtZjYwNS00NTlkLTg5N2MtNmM1NWY2MGU4MjIyIiwidHlwIjoiSUQiLCJhenAiOiJ3ZWJ1aSIsInNpZCI6IjAwYTUxNjg2LWQwNDItNDhhMS05OTQxLTZhOTE4N2Q2YTkyNiIsImF0X2hhc2giOiJJeWZsRXJJMHVMZWVyVi16Vzc2Qi1nIiwiYWNyIjoiMCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoiTGluaCBUcmFuIiwicHJlZmVycmVkX3VzZXJuYW1lIjoibGluaEBnbWFpbC5jb20iLCJnaXZlbl9uYW1lIjoiTGluaCIsImZhbWlseV9uYW1lIjoiVHJhbiIsImVtYWlsIjoibGluaEBnbWFpbC5jb20ifQ.IvX5wCUFh9MiLvJUHhfECefNjUJk6Vl588vyYqWERViQe3DdWyyOwFdK8wtp3RJJwqZtxmA4Xok9LFq67f6pKF-wtNEWW7hm_pmfzqyldfNchNnl1oQXYxlpkCYDSASNP2k4YfcI2aIRIQ0jj7vvxqa3QxB8CDfAiojHA2MsaQ_m4kAeaki_2Nzo4hHcw5xMFh6Iipi126EgOPVbWqWXcaHCFrkAsrvEaLBm2o2NPPIrSKxkHnqXadzLgPLSdiH0IXAxl0DKaNpkj4byCuzVlnOmaPAacg3qlPlVEl3HlTGXWnCLMCsYMMnu6CL_VoWlR2hExZqTsbxb3_L40q4KhA")
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
