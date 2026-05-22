import os
from contextlib import asynccontextmanager
from typing import Any

import boto3
import pyarrow as pa
import uvicorn
import lancedb
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

S3_URI = os.getenv("LANCEDB_URI", "s3://lancedb/")
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
S3_BUCKET = os.getenv("LANCEDB_BUCKET", "lancedb")
PORT = int(os.getenv("PORT", "8080"))

db: lancedb.AsyncConnection | None = None


def ensure_bucket() -> None:
    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
    )
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            s3.create_bucket(Bucket=S3_BUCKET)
            print(f"created bucket {S3_BUCKET!r}", flush=True)
        else:
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db
    ensure_bucket()
    db = await lancedb.connect_async(
        S3_URI,
        storage_options={
            "aws_access_key_id": S3_ACCESS_KEY,
            "aws_secret_access_key": S3_SECRET_KEY,
            "endpoint": S3_ENDPOINT,
            "region": S3_REGION,
            "allow_http": "true",
            "aws_virtual_hosted_style_request": "false",
        },
    )
    yield


app = FastAPI(lifespan=lifespan)


class CreateTableRequest(BaseModel):
    dimension: int
    mode: str = "create"


class InsertRequest(BaseModel):
    rows: list[dict[str, Any]]


class SearchRequest(BaseModel):
    vector: list[float]
    limit: int = 10
    metric: str = "cosine"


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/tables")
async def list_tables():
    tables = await db.table_names()
    return {"tables": tables}


@app.post("/tables/{name}")
async def create_table(name: str, req: CreateTableRequest):
    if req.mode not in ("create", "overwrite"):
        raise HTTPException(400, "mode must be 'create' or 'overwrite'")
    schema = pa.schema([
        pa.field("id", pa.int64()),
        pa.field("text", pa.utf8()),
        pa.field("vector", pa.list_(pa.float32(), req.dimension)),
    ])
    await db.create_table(name, schema=schema, mode=req.mode)
    return {"table": name, "dimension": req.dimension}


@app.post("/tables/{name}/insert")
async def insert(name: str, req: InsertRequest):
    try:
        table = await db.open_table(name)
    except Exception:
        raise HTTPException(404, f"table '{name}' not found")

    schema = await table.schema()
    cols: dict[str, list] = {f.name: [] for f in schema if not f.name.startswith("_")}
    for row in req.rows:
        for fname in cols:
            cols[fname].append(row.get(fname))

    arrays: dict[str, pa.Array] = {}
    for f in schema:
        if f.name.startswith("_") or f.name not in cols:
            continue
        if pa.types.is_fixed_size_list(f.type):
            arrays[f.name] = pa.array(
                [pa.array(v, type=f.type.value_type) for v in cols[f.name]],
                type=f.type,
            )
        else:
            arrays[f.name] = pa.array(cols[f.name], type=f.type)

    await table.add(pa.table(arrays))
    return {"inserted": len(req.rows)}


@app.post("/tables/{name}/search")
async def search(name: str, req: SearchRequest):
    try:
        table = await db.open_table(name)
    except Exception:
        raise HTTPException(404, f"table '{name}' not found")

    query = await table.search(req.vector, vector_column_name="vector")
    arrow_result = await query.distance_type(req.metric).limit(req.limit).to_arrow()
    pydict = arrow_result.to_pydict()
    n = len(arrow_result)
    rows = [
        {
            k: (v[i].tolist() if hasattr(v[i], "tolist") else v[i])
            for k, v in pydict.items()
        }
        for i in range(n)
    ]
    return {"results": rows, "count": n}


@app.delete("/tables/{name}")
async def drop_table(name: str):
    await db.drop_table(name)
    return {"dropped": name}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
