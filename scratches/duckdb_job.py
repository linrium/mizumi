import os
from pathlib import Path

CADDY_ROOT_CERT = Path.home() / "Library/Application Support/Caddy/pki/authorities/local/root.crt"

if CADDY_ROOT_CERT.exists():
    cert_path = str(CADDY_ROOT_CERT)
    os.environ.setdefault("SSL_CERT_FILE", cert_path)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_path)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)

import duckdb

UC_TOKEN = os.getenv("DUCKDB_UC_TOKEN", "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ4RU9fMXBid0VXSnFKTUlwWk9yTG90SXhYMWJscFYtaWN3ZTVyak5EbENVIn0.eyJleHAiOjE3NzkwMTU3NDAsImlhdCI6MTc3OTAxNTQ0MCwiYXV0aF90aW1lIjoxNzc5MDE0NTQyLCJqdGkiOiI4ZGNkMmYwMS0zNGE2LTUwYzAtNWI5My0zNmQ3Y2UxYjkwYzMiLCJpc3MiOiJodHRwOi8va2V5Y2xvYWstc3ZjLmtleWNsb2FrLnN2Yy5jbHVzdGVyLmxvY2FsOjgwODAvcmVhbG1zL3NvdmljbyIsImF1ZCI6IndlYnVpIiwic3ViIjoiOTI4MjI1NWMtZTFkZi00MzllLTg5MWItYTJlYjQ0NzZhNzQ5IiwidHlwIjoiSUQiLCJhenAiOiJ3ZWJ1aSIsInNpZCI6IjcwZDNiMzFlLWFjYjktNGUzZi1iZDdmLTEyYTU2YmM4MjljZiIsImF0X2hhc2giOiJ2N3ZjemRXalZFRTVZcjlrVzRwTHpBIiwiYWNyIjoiMCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoiS2hhbyBTb2kiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJraGFvc29pQGdtYWlsLmNvbSIsImdpdmVuX25hbWUiOiJLaGFvIiwiZmFtaWx5X25hbWUiOiJTb2kiLCJlbWFpbCI6ImtoYW9zb2lAZ21haWwuY29tIn0.RtiO-rELw0PPi8xM_gD626cPA-oebbEgJeSD970j6BShY9tGx9GF-6JqBXYQcBGRZNvaS-7wmcNdqask2d6bDjwvkH_Caa2chZa8y37TYX_oUQvid16kjZfPl5S4GPZhqbJTU9VbdyRY6j4wmkrpxPEx_7Vy9Vya_GO4wEH7VHkLmfmUmZ0JUgGrc9VTVbs-um-TlKgnJPYOGcOeyt-yOcDjVwh1SQWMd8WvVqWiUD8w0yEi1Vj10RBSUDUcoN6i1i3IfRQ-_FY_yQzaSoEArxHTJkJoADbPleN0cWgcuwR0cdWMRcgSNUXUWfHiIoQy_1VCMg6Np8y5xG1KebyBcg")
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
ATTACH 'vietjetair_sandbox' AS vietjetair_sandbox (TYPE unity_catalog, READ_ONLY, DEFAULT_SCHEMA 'vietjetair_bookings_sandbox_gold');
""")

duckdb.sql("SHOW ALL TABLES;").show()
duckdb.sql("SELECT * FROM vietjetair_sandbox.vietjetair_bookings_sandbox_gold.ancillary_revenue_v1 LIMIT 500;").show()
