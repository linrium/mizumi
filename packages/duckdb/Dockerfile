FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "duckdb==1.5.2" \
    "dagster-pipes==1.13.4" \
    "pandas"

# Pre-install extensions at build time so the pod has no outbound dependency
RUN python -c "import duckdb; con = duckdb.connect(); con.execute('INSTALL httpfs; INSTALL delta; INSTALL unity_catalog;')"

RUN mkdir -p /opt/duckdb
COPY packages/duckdb/query_api.py /opt/duckdb/query_api.py

WORKDIR /opt/duckdb
