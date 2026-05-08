FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "dagster==1.13.4" \
    "dagster-postgres" \
    "dagster-k8s"

COPY definitions.py /app/definitions.py

WORKDIR /app
EXPOSE 80
