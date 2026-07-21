import asyncio
import json as _json
import os
import subprocess
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

CADDY_ROOT_CERT = (
    Path.home() / "Library/Application Support/Caddy/pki/authorities/local/root.crt"
)
CLUSTER_PROXY_CERT = Path(
    os.getenv("DUCKDB_CA_CERT_PATH", "/etc/rustfs-s3-proxy/tls.crt")
)

if CADDY_ROOT_CERT.exists():
    cert_path = str(CADDY_ROOT_CERT)
    os.environ.setdefault("SSL_CERT_FILE", cert_path)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_path)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)

UC_ENDPOINT = os.getenv(
    "DUCKDB_UC_ENDPOINT", "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080"
)
UC_AWS_REGION = os.getenv("DUCKDB_UC_AWS_REGION", "us-east-1")
S3_ENDPOINT = os.getenv(
    "AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000"
)
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
PORT = int(os.getenv("PORT", "8080"))
IDLE_TIMEOUT_SECS = int(os.getenv("IDLE_TIMEOUT_SECS", "300"))
DUCKDB_BIN = os.getenv("DUCKDB_BIN", "/usr/local/bin/duckdb")

# Keep this aligned with infra/k8s/unitycatalog/bootstrap-job.yaml.
CATALOG_DEFAULT_SCHEMAS = {
    "hdbank": "hdbank_partnership_prod_bronze",
    "vietjetair": "vietjetair_partnership_prod_bronze",
    "partnership": "co_brand_silver",
}

last_request_time = time.time()


def sql_quote(s: str) -> str:
    return s.replace("'", "''")


def base_duckdb_sql(token: str) -> str:
    endpoint_host = S3_ENDPOINT.replace("http://", "").replace("https://", "")
    use_ssl = str(S3_ENDPOINT.startswith("https://")).lower()
    return f"""
        LOAD httpfs;
        LOAD delta;
        LOAD unity_catalog;

        CREATE OR REPLACE SECRET __s3__ (
            TYPE s3,
            KEY_ID '{sql_quote(S3_ACCESS_KEY)}',
            SECRET '{sql_quote(S3_SECRET_KEY)}',
            ENDPOINT '{sql_quote(endpoint_host)}',
            USE_SSL {use_ssl},
            URL_STYLE 'path',
            REGION '{sql_quote(S3_REGION)}'
        );

        CREATE OR REPLACE SECRET (
            TYPE unity_catalog,
            TOKEN '{sql_quote(token)}',
            ENDPOINT '{sql_quote(UC_ENDPOINT)}',
            AWS_REGION '{sql_quote(UC_AWS_REGION)}',
            S3_ENDPOINT '{sql_quote(endpoint_host)}',
            S3_USE_SSL {use_ssl},
            S3_URL_STYLE 'path'
        );
    """


def attach_catalogs_sql() -> str:
    statements = []
    for name, default_schema in CATALOG_DEFAULT_SCHEMAS.items():
        statements.append(f"""
            ATTACH IF NOT EXISTS '{name}' AS {name} (
                TYPE unity_catalog,
                DEFAULT_SCHEMA '{default_schema}',
                READ_ONLY
            );
        """)
    return "\n".join(statements)


def run_duckdb_query(sql: str, token: str) -> dict:
    full_sql = "\n".join([base_duckdb_sql(token), attach_catalogs_sql(), sql])
    proc = subprocess.run(
        [DUCKDB_BIN, "-json", "-c", full_sql],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=120,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())

    json_lines = [line for line in proc.stdout.splitlines() if line.strip()]
    if not json_lines:
        return {"columns": [], "rows": [], "row_count": 0}

    rows_as_objects = _json.loads(json_lines[-1])
    columns = list(rows_as_objects[0].keys()) if rows_as_objects else []
    rows = [[row.get(column) for column in columns] for row in rows_as_objects]
    return {"columns": columns, "rows": rows, "row_count": len(rows)}


async def idle_watcher() -> None:
    while True:
        await asyncio.sleep(30)
        elapsed = time.time() - last_request_time
        if elapsed >= IDLE_TIMEOUT_SECS:
            print(f"Idle for {elapsed:.0f}s, shutting down", flush=True)
            os._exit(0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(idle_watcher())
    yield


app = FastAPI(lifespan=lifespan)


class QueryRequest(BaseModel):
    sql: str
    uc_token: Optional[str] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/query")
def query(req: QueryRequest):
    global last_request_time
    last_request_time = time.time()

    if not req.uc_token:
        return JSONResponse(
            status_code=400,
            content={"error": "uc_token is required for Unity Catalog queries"},
        )

    try:
        return run_duckdb_query(req.sql, req.uc_token)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
