FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "lancedb==0.22.0" \
    "fastapi" \
    "uvicorn[standard]" \
    "pyarrow" \
    "boto3" \
    "openai"

COPY server.py /opt/lancedb-server/server.py
COPY embed_schema.py /opt/lancedb-server/embed_schema.py

WORKDIR /opt/lancedb-server
EXPOSE 8080
CMD ["python", "server.py"]
