FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "datafusion==50.1.0" \
    "pyarrow>=15.0.0"

RUN mkdir -p /opt/datafusion
COPY packages/datafusion/query_rustfs.py /opt/datafusion/query_rustfs.py

WORKDIR /opt/datafusion
