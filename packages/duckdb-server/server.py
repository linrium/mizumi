import asyncio
import json as _json
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

import duckdb
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

UC_ENDPOINT = os.getenv("DUCKDB_UC_ENDPOINT", "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080")
UC_AWS_REGION = os.getenv("DUCKDB_UC_AWS_REGION", "us-east-1")
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
PORT = int(os.getenv("PORT", "8080"))
IDLE_TIMEOUT_SECS = int(os.getenv("IDLE_TIMEOUT_SECS", "300"))

CATALOGS = [
    ("hdbank", "hdbank_partnership_prod_bronze"),
    ("vietjetair", "vietjetair_partnership_prod_bronze"),
    ("hdbank_sandbox", "hdbank_payments_sandbox_bronze"),
    ("vietjetair_sandbox", "vietjetair_bookings_sandbox_bronze"),
    ("partnership_sandbox", "credit_risk"),
]

con: duckdb.DuckDBPyConnection | None = None
lock = threading.Lock()
catalogs_attached = False
last_request_time = time.time()


def sql_quote(s: str) -> str:
    return s.replace("'", "''")


def init_duckdb() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect()
    c.execute("LOAD httpfs; LOAD delta; LOAD unity_catalog;")
    endpoint_host = S3_ENDPOINT.replace("http://", "").replace("https://", "")
    use_ssl = str(S3_ENDPOINT.startswith("https://")).lower()
    c.execute(f"""
        CREATE OR REPLACE SECRET __s3__ (
            TYPE s3,
            KEY_ID '{sql_quote(S3_ACCESS_KEY)}',
            SECRET '{sql_quote(S3_SECRET_KEY)}',
            ENDPOINT '{sql_quote(endpoint_host)}',
            USE_SSL {use_ssl},
            URL_STYLE 'path',
            REGION '{sql_quote(S3_REGION)}'
        )
    """)
    return c


def attach_catalogs() -> None:
    for name, schema in CATALOGS:
        con.execute(f"""
            ATTACH IF NOT EXISTS '{name}' AS {name} (
                TYPE unity_catalog,
                READ_ONLY,
                DEFAULT_SCHEMA '{schema}'
            )
        """)


async def idle_watcher() -> None:
    while True:
        await asyncio.sleep(30)
        elapsed = time.time() - last_request_time
        if elapsed >= IDLE_TIMEOUT_SECS:
            print(f"Idle for {elapsed:.0f}s, shutting down", flush=True)
            os._exit(0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global con
    con = init_duckdb()
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
    global last_request_time, catalogs_attached
    last_request_time = time.time()

    with lock:
        try:
            if req.uc_token:
                con.execute(f"""
                    CREATE OR REPLACE SECRET __uc__ (
                        TYPE unity_catalog,
                        TOKEN '{sql_quote(req.uc_token)}',
                        ENDPOINT '{sql_quote(UC_ENDPOINT)}',
                        AWS_REGION '{sql_quote(UC_AWS_REGION)}'
                    )
                """)

            if not catalogs_attached:
                attach_catalogs()
                catalogs_attached = True

            result = con.execute(req.sql).fetchdf()
            data = _json.loads(result.to_json(orient="split", date_format="iso"))
            return {
                "columns": data["columns"],
                "rows": data["data"],
                "row_count": len(data["data"]),
            }
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": str(e)})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
