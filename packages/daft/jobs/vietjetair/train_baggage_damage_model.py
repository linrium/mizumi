from __future__ import annotations

import io
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import boto3
import daft
import joblib
import numpy as np
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes
from PIL import Image, UnidentifiedImageError
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from transformers import CLIPModel, CLIPProcessor

# === Config ===
GOLD_TABLE_PATH = os.getenv(
    "GOLD_TABLE_PATH",
    "s3://unitycatalog/vietjetair/vietjetair_partnership_prod_gold/baggage_damage_classifications_v1",
)
SOURCE_BUCKET = os.getenv("SOURCE_BUCKET", "unitycatalog")
MODEL_BUCKET = os.getenv("MODEL_BUCKET", "models")
MODEL_KEY_PREFIX = os.getenv("MODEL_KEY_PREFIX", "vietjetair/baggage-damage-classifier")
CLIP_MODEL_ID = os.getenv("CLIP_MODEL_ID", "openai/clip-vit-base-patch32")
MIN_CONFIDENCE = float(os.getenv("MIN_CONFIDENCE", "0.25"))
MAX_ITER = int(os.getenv("MAX_ITER", "1000"))
BATCH_SIZE = max(int(os.getenv("BATCH_SIZE", "16")), 1)

RUSTFS_ENDPOINT_URL = os.getenv("RUSTFS_ENDPOINT_URL", "http://127.0.0.1:9000")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
RUSTFS_USE_SSL = os.getenv("RUSTFS_USE_SSL", "false").lower() == "true"


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


def ensure_bucket(s3_client, bucket: str) -> None:
    try:
        s3_client.head_bucket(Bucket=bucket)
    except ClientError:
        s3_client.create_bucket(Bucket=bucket)


def load_training_rows() -> list[dict]:
    io_config = IOConfig(
        s3=S3Config(
            endpoint_url=RUSTFS_ENDPOINT_URL,
            key_id=AWS_ACCESS_KEY_ID,
            access_key=AWS_SECRET_ACCESS_KEY,
            use_ssl=RUSTFS_USE_SSL,
        )
    )
    return (
        daft.read_deltalake(GOLD_TABLE_PATH, io_config=io_config)
        .where(
            (daft.col("classification_status") == "classified")
            & (daft.col("damage_score") >= MIN_CONFIDENCE)
            & daft.col("damage_label").not_null()
            & daft.col("object_key").not_null()
        )
        .collect()
        .to_arrow()
        .to_pylist()
    )


def load_image(s3_client, object_key: str) -> Image.Image:
    response = s3_client.get_object(Bucket=SOURCE_BUCKET, Key=object_key)
    return Image.open(io.BytesIO(response["Body"].read())).convert("RGB")


def extract_embeddings(
    rows: list[dict],
    s3_client,
    processor: CLIPProcessor,
    clip_model: CLIPModel,
) -> tuple[np.ndarray, list[str]]:
    import torch

    all_embeddings: list[np.ndarray] = []
    all_labels: list[str] = []

    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        images: list[Image.Image] = []
        labels: list[str] = []
        for row in batch:
            try:
                images.append(load_image(s3_client, row["object_key"]))
                labels.append(row["damage_label"])
            except (ClientError, BotoCoreError, OSError, UnidentifiedImageError):
                continue

        if not images:
            continue

        inputs = processor(images=images, return_tensors="pt", padding=True)
        with torch.no_grad():
            feats = clip_model.get_image_features(**inputs)
            feats = feats / feats.norm(dim=-1, keepdim=True)

        all_embeddings.append(feats.cpu().numpy())
        all_labels.extend(labels)

    if not all_embeddings:
        raise RuntimeError("No images could be loaded for training")

    return np.vstack(all_embeddings), all_labels


def train_classifier(
    X: np.ndarray, y: list[str]
) -> tuple[LogisticRegression, LabelEncoder, np.ndarray]:
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    clf = LogisticRegression(
        max_iter=MAX_ITER, C=1.0, class_weight="balanced", random_state=42
    )
    clf.fit(X, y_enc)
    return clf, le, y_enc


def upload_artifacts(
    s3_client,
    run_ts: str,
    clf: LogisticRegression,
    le: LabelEncoder,
    metadata: dict,
) -> str:
    ensure_bucket(s3_client, MODEL_BUCKET)
    prefix = f"{MODEL_KEY_PREFIX}/{run_ts}"

    model_buf = io.BytesIO()
    joblib.dump({"classifier": clf, "label_encoder": le}, model_buf)
    model_buf.seek(0)
    s3_client.put_object(
        Bucket=MODEL_BUCKET,
        Key=f"{prefix}/model.joblib",
        Body=model_buf.getvalue(),
    )

    s3_client.put_object(
        Bucket=MODEL_BUCKET,
        Key=f"{prefix}/metadata.json",
        Body=json.dumps(metadata, indent=2).encode(),
        ContentType="application/json",
    )

    return f"s3://{MODEL_BUCKET}/{prefix}"


def main() -> None:
    run_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    s3_client = build_s3_client()

    rows = load_training_rows()
    if not rows:
        raise RuntimeError(
            f"No training rows found in {GOLD_TABLE_PATH} "
            f"(min_confidence={MIN_CONFIDENCE})"
        )

    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID)
    clip_model = CLIPModel.from_pretrained(CLIP_MODEL_ID)
    clip_model.eval()

    X, y = extract_embeddings(rows, s3_client, processor, clip_model)
    clf, le, y_enc = train_classifier(X, y)

    train_acc = float((clf.predict(X) == y_enc).mean())
    classes = le.classes_.tolist()

    metadata = {
        "run_ts": run_ts,
        "clip_model_id": CLIP_MODEL_ID,
        "gold_table_path": GOLD_TABLE_PATH,
        "training_samples": len(y),
        "classes": classes,
        "train_accuracy": round(train_acc, 4),
        "min_confidence_filter": MIN_CONFIDENCE,
        "sklearn_classifier": type(clf).__name__,
    }

    model_uri = upload_artifacts(s3_client, run_ts, clf, le, metadata)

    with maybe_open_dagster_pipes() as pipes:
        if pipes is not None:
            pipes.report_asset_materialization(
                asset_key="vietjetair_baggage_damage_model",
                metadata={
                    "model_uri": model_uri,
                    "training_samples": len(y),
                    "classes": ", ".join(classes),
                    "train_accuracy": train_acc,
                    "clip_model_id": CLIP_MODEL_ID,
                    "run_ts": run_ts,
                },
            )


if __name__ == "__main__":
    main()
