FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "daft==0.7.10" \
    "dagster-pipes" \
    "ray[client]==2.46.0"

RUN mkdir -p /opt/daft/jobs
COPY packages/daft/jobs/ /opt/daft/jobs/

WORKDIR /opt/daft
