FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "datafusion==50.1.0" \
    "dagster-pipes==1.13.4" \
    "pyarrow>=15.0.0"

RUN mkdir -p /opt/datafusion
COPY packages/datafusion/query_rustfs.py /opt/datafusion/query_rustfs.py
COPY packages/datafusion/query_rustfs_dagster.py /opt/datafusion/query_rustfs_dagster.py

WORKDIR /opt/datafusion
