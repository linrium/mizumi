from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any, Iterator

import boto3
import daft
import deltalake
import pyarrow as pa
import torch
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dagster_pipes import open_dagster_pipes
from PIL import Image, UnidentifiedImageError
from transformers import pipeline

SOURCE_BUCKET = os.getenv("SOURCE_BUCKET", "unitycatalog")
SOURCE_PREFIX = os.getenv("SOURCE_PREFIX", "vietjetair/baggage_damaged_reports/")
TARGET_PATH = os.getenv(
    "TARGET_PATH",
    "s3://unitycatalog/vietjetair/vietjetair_partnership_prod_gold/baggage_damage_classifications_v1",
)
MODEL_ID = os.getenv("MODEL_ID", "openai/clip-vit-base-patch32")
WRITE_MODE = os.getenv("WRITE_MODE", "overwrite")
RUSTFS_ENDPOINT_URL = os.getenv("RUSTFS_ENDPOINT_URL", "http://127.0.0.1:9000")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
RUSTFS_USE_SSL = os.getenv("RUSTFS_USE_SSL", "false").lower() == "true"
CLASSIFICATION_BATCH_SIZE = max(int(os.getenv("CLASSIFICATION_BATCH_SIZE", "4")), 1)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DEFAULT_CANDIDATE_LABELS = [
    "broken wheel",
    "broken handle",
    "zipper damage",
    "torn fabric",
    "cracked shell",
    "dent or crush damage",
    "scratch or scuff",
    "stain or spill",
    "tag or lock damage",
    "other baggage damage",
]
CANDIDATE_LABELS = [
    label.strip()
    for label in os.getenv("CANDIDATE_LABELS", ",".join(DEFAULT_CANDIDATE_LABELS)).split(",")
    if label.strip()
]

S3_STORAGE_OPTIONS = {
    "endpoint_url": RUSTFS_ENDPOINT_URL,
    "aws_access_key_id": AWS_ACCESS_KEY_ID,
    "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
    "aws_region": AWS_REGION,
    "aws_allow_http": str(not RUSTFS_USE_SSL).lower(),
    "allow_unsafe_rename": "true",
}

RESULT_SCHEMA = pa.schema(
    [
        pa.field("image_uri", pa.string(), nullable=False),
        pa.field("bucket", pa.string(), nullable=False),
        pa.field("object_key", pa.string(), nullable=False),
        pa.field("file_name", pa.string(), nullable=False),
        pa.field("etag", pa.string()),
        pa.field("size_bytes", pa.int32()),
        pa.field("last_modified", pa.timestamp("us", tz="UTC")),
        pa.field("damage_label", pa.string()),
        pa.field("damage_score", pa.float64()),
        pa.field("label_rankings_json", pa.string()),
        pa.field("model_id", pa.string(), nullable=False),
        pa.field("classification_status", pa.string(), nullable=False),
        pa.field("error_message", pa.string()),
        pa.field("classified_at", pa.timestamp("us", tz="UTC"), nullable=False),
    ]
)


@contextmanager
def maybe_open_dagster_pipes() -> Iterator[Any]:
    if os.getenv("DAGSTER_PIPES_CONTEXT"):
        with open_dagster_pipes() as pipes:
            yield pipes
        return
    yield None


def build_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=RUSTFS_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
        use_ssl=RUSTFS_USE_SSL,
        config=Config(signature_version="s3v4"),
    )


def normalized_source_prefix() -> str:
    return SOURCE_PREFIX.rstrip("/") + "/"


def is_supported_image(key: str) -> bool:
    return PurePosixPath(key).suffix.lower() in IMAGE_EXTENSIONS


def list_source_images(s3_client) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    prefix = normalized_source_prefix()
    paginator = s3_client.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=SOURCE_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            object_key = obj["Key"]
            if object_key.endswith("/") or not is_supported_image(object_key):
                continue
            rows.append(
                {
                    "image_uri": f"s3://{SOURCE_BUCKET}/{object_key}",
                    "bucket": SOURCE_BUCKET,
                    "object_key": object_key,
                    "file_name": PurePosixPath(object_key).name,
                    "etag": str(obj.get("ETag", "")).strip('"'),
                    "size_bytes": int(obj.get("Size", 0)),
                    "last_modified": obj["LastModified"].astimezone(timezone.utc),
                }
            )
    return rows


def build_classifier():
    device = 0 if torch.cuda.is_available() else -1
    return pipeline(
        task="zero-shot-image-classification",
        model=MODEL_ID,
        device=device,
    )


def load_image(s3_client, object_key: str) -> Image.Image:
    response = s3_client.get_object(Bucket=SOURCE_BUCKET, Key=object_key)
    payload = response["Body"].read()
    return Image.open(BytesIO(payload)).convert("RGB")


def classify_rows(rows: list[dict[str, Any]], s3_client) -> list[dict[str, Any]]:
    classifier = build_classifier()
    results: list[dict[str, Any]] = []

    for start in range(0, len(rows), CLASSIFICATION_BATCH_SIZE):
        batch = rows[start : start + CLASSIFICATION_BATCH_SIZE]
        classified_at = datetime.now(timezone.utc)
        loaded_images: list[Image.Image] = []
        valid_rows: list[dict[str, Any]] = []

        for row in batch:
            try:
                loaded_images.append(load_image(s3_client, row["object_key"]))
                valid_rows.append(row)
            except (ClientError, BotoCoreError, OSError, UnidentifiedImageError) as err:
                results.append(
                    {
                        **row,
                        "damage_label": None,
                        "damage_score": None,
                        "label_rankings_json": None,
                        "model_id": MODEL_ID,
                        "classification_status": "error",
                        "error_message": str(err),
                        "classified_at": classified_at,
                    }
                )

        if not loaded_images:
            continue

        predictions = classifier(loaded_images, candidate_labels=CANDIDATE_LABELS)
        for row, ranking in zip(valid_rows, predictions, strict=True):
            top_match = ranking[0]
            results.append(
                {
                    **row,
                    "damage_label": top_match["label"],
                    "damage_score": float(top_match["score"]),
                    "label_rankings_json": json.dumps(
                        [
                            {"label": item["label"], "score": round(float(item["score"]), 6)}
                            for item in ranking
                        ],
                        separators=(",", ":"),
                    ),
                    "model_id": MODEL_ID,
                    "classification_status": "classified",
                    "error_message": None,
                    "classified_at": classified_at,
                }
            )
    return results


def write_results(rows: list[dict[str, Any]]) -> None:
    result_df = daft.from_pylist(rows)
    arrow_table = result_df.to_arrow()
    if arrow_table.schema != RESULT_SCHEMA:
        arrow_table = arrow_table.cast(RESULT_SCHEMA)

    schema_mode = "overwrite" if WRITE_MODE == "overwrite" else "merge"
    deltalake.write_deltalake(
        TARGET_PATH,
        arrow_table,
        storage_options=S3_STORAGE_OPTIONS,
        mode=WRITE_MODE,
        schema_mode=schema_mode,
    )


def main() -> None:
    s3_client = build_s3_client()
    source_rows = list_source_images(s3_client)
    if not source_rows:
        raise RuntimeError(
            f"No supported images found in s3://{SOURCE_BUCKET}/{normalized_source_prefix()}"
        )

    manifest_df = daft.from_pylist(source_rows)
    results = classify_rows(source_rows, s3_client)
    write_results(results)

    classified_count = sum(1 for row in results if row["classification_status"] == "classified")
    error_count = len(results) - classified_count

    with maybe_open_dagster_pipes() as pipes:
        if pipes is not None:
            pipes.report_asset_materialization(
                asset_key="vietjetair_gold_baggage_damage_classifications",
                metadata={
                    "source": f"s3://{SOURCE_BUCKET}/{normalized_source_prefix()}",
                    "target": TARGET_PATH,
                    "source_image_count": len(source_rows),
                    "manifest_rows": len(manifest_df.to_arrow()),
                    "classified_rows": classified_count,
                    "error_rows": error_count,
                    "model_id": MODEL_ID,
                    "candidate_labels": ", ".join(CANDIDATE_LABELS),
                },
            )


if __name__ == "__main__":
    main()
