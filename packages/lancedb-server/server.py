import os
from contextlib import asynccontextmanager
from typing import Any

import boto3
import pyarrow as pa
import uvicorn
import lancedb
from lancedb.index import FTS
from lancedb.rerankers import RRFReranker
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


class CreateFtsIndexRequest(BaseModel):
    field: str = "text"
    replace: bool = True


class InsertRequest(BaseModel):
    rows: list[dict[str, Any]]


class SearchRequest(BaseModel):
    query_type: str = "vector"  # "vector" | "fts" | "hybrid"
    vector: list[float] | None = None
    text: str | None = None
    limit: int = 10
    metric: str = "cosine"
    rerank: bool = False
    rrf_k: int = 60  # RRF constant — lower values amplify rank differences
    return_score: str = "relevance"  # "relevance" | "all"


def arrow_to_rows(tbl: pa.Table) -> list[dict]:
    pydict = tbl.to_pydict()
    return [
        {k: (v[i].tolist() if hasattr(v[i], "tolist") else v[i]) for k, v in pydict.items()}
        for i in range(len(tbl))
    ]


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


@app.post("/tables/{name}/index/fts")
async def create_fts_index(name: str, req: CreateFtsIndexRequest):
    try:
        table = await db.open_table(name)
    except Exception:
        raise HTTPException(404, f"table '{name}' not found")
    await table.create_index(req.field, config=FTS(with_position=True), replace=req.replace)
    return {"table": name, "index": "fts", "field": req.field}


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

    if req.query_type == "vector":
        if req.vector is None:
            raise HTTPException(400, "vector is required for query_type='vector'")
        q = await table.search(req.vector, vector_column_name="vector")
        result = await q.distance_type(req.metric).limit(req.limit).to_arrow()
        rows = arrow_to_rows(result)

    elif req.query_type == "fts":
        if req.text is None:
            raise HTTPException(400, "text is required for query_type='fts'")
        q = await table.search(req.text, query_type="fts")
        result = await q.limit(req.limit).to_arrow()
        rows = arrow_to_rows(result)

    elif req.query_type == "hybrid":
        if req.vector is None or req.text is None:
            raise HTTPException(400, "both vector and text are required for query_type='hybrid'")

        fetch = req.limit * 2  # oversample so reranker has enough candidates
        vec_q = await table.search(req.vector, vector_column_name="vector")
        vec_result = await vec_q.distance_type(req.metric).limit(fetch).with_row_id(True).to_arrow()

        fts_q = await table.search(req.text, query_type="fts")
        fts_result = await fts_q.limit(fetch).with_row_id(True).to_arrow()

        if req.rerank:
            reranker = RRFReranker(K=req.rrf_k, return_score=req.return_score)
            merged = reranker.rerank_multivector([vec_result, fts_result])
            rows = arrow_to_rows(merged.slice(0, req.limit))
        else:
            # Interleave vec + fts results, deduplicate by row id, take limit
            seen: set = set()
            interleaved: list[dict] = []
            vec_rows = arrow_to_rows(vec_result)
            fts_rows = arrow_to_rows(fts_result)
            for row in vec_rows + fts_rows:
                rid = row.get("_rowid")
                if rid not in seen:
                    seen.add(rid)
                    interleaved.append(row)
            rows = interleaved[: req.limit]

    else:
        raise HTTPException(400, f"unknown query_type '{req.query_type}', must be 'vector', 'fts', or 'hybrid'")

    return {"results": rows, "count": len(rows)}


@app.delete("/tables/{name}")
async def drop_table(name: str):
    await db.drop_table(name)
    return {"dropped": name}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
