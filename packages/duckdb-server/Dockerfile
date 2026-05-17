FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir "duckdb==1.5.2" "fastapi" "uvicorn[standard]" "pandas"

# Pre-install DuckDB extensions so the pod needs no outbound internet access at startup
RUN python -c "import duckdb; con = duckdb.connect(); con.execute('INSTALL httpfs; INSTALL delta; INSTALL unity_catalog;')"

COPY server.py /opt/duckdb-server/server.py

WORKDIR /opt/duckdb-server
EXPOSE 8080
CMD ["python", "server.py"]
