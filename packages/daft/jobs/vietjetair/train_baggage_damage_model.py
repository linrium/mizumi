from __future__ import annotations

import io
import json
import os
import tempfile
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
CLIP_MODEL_ID = os.getenv("CLIP_MODEL_ID", "openai/clip-vit-base-patch32")
MIN_CONFIDENCE = float(os.getenv("MIN_CONFIDENCE", "0.25"))
MAX_ITER = int(os.getenv("MAX_ITER", "1000"))
BATCH_SIZE = max(int(os.getenv("BATCH_SIZE", "16")), 1)
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "")
MLFLOW_EXPERIMENT_NAME = os.getenv(
    "MLFLOW_EXPERIMENT_NAME", "vietjetair-baggage-damage"
)
MLFLOW_MODEL_NAME = os.getenv("MLFLOW_MODEL_NAME", "baggage-damage-detector")
MLFLOW_RUN_NAME = os.getenv("MLFLOW_RUN_NAME", "")

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


@contextmanager
def maybe_start_mlflow_run(run_ts: str) -> Iterator[Any]:
    if not MLFLOW_TRACKING_URI:
        yield None
        return

    import mlflow

    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment(MLFLOW_EXPERIMENT_NAME)
    mlflow.tracing.enable()
    run_name = MLFLOW_RUN_NAME or f"baggage-damage-{run_ts}"
    with mlflow.start_run(run_name=run_name):
        yield mlflow


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


def build_mlflow_model_signature():
    from mlflow.models.signature import ModelSignature
    from mlflow.types import ColSpec, Schema

    input_schema = Schema(
        [
            ColSpec("binary", "image_bytes"),
        ]
    )
    output_schema = Schema(
        [
            ColSpec("string", "label"),
            ColSpec("double", "score"),
            ColSpec("string", "rankings_json"),
            ColSpec("string", "model_uri"),
            ColSpec("string", "metadata_json"),
        ]
    )
    return ModelSignature(inputs=input_schema, outputs=output_schema)


def main() -> None:
    run_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    s3_client = build_s3_client()

    registered_model_uri = None

    with maybe_start_mlflow_run(run_ts) as mlflow_run:
        if mlflow_run is not None:
            mlflow_run.log_params(
                {
                    "clip_model_id": CLIP_MODEL_ID,
                    "gold_table_path": GOLD_TABLE_PATH,
                    "source_bucket": SOURCE_BUCKET,
                    "min_confidence": MIN_CONFIDENCE,
                    "max_iter": MAX_ITER,
                    "batch_size": BATCH_SIZE,
                    "classifier": "LogisticRegression",
                }
            )

        # --- span: load data ---
        if mlflow_run is not None:
            with mlflow_run.start_span("load_training_rows") as span:
                span.set_inputs(
                    {"gold_table_path": GOLD_TABLE_PATH, "min_confidence": MIN_CONFIDENCE}
                )
                rows = load_training_rows()
                span.set_outputs({"row_count": len(rows)})
        else:
            rows = load_training_rows()

        if mlflow_run is not None:
            mlflow_run.log_metric("candidate_rows", len(rows))
        if not rows:
            raise RuntimeError(
                f"No training rows found in {GOLD_TABLE_PATH} "
                f"(min_confidence={MIN_CONFIDENCE})"
            )

        # --- span: load CLIP model ---
        if mlflow_run is not None:
            with mlflow_run.start_span("load_clip_model") as span:
                span.set_inputs({"clip_model_id": CLIP_MODEL_ID})
                processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID, use_fast=False)
                clip_model = CLIPModel.from_pretrained(
                    CLIP_MODEL_ID, low_cpu_mem_usage=False
                )
                clip_model.eval()
                span.set_outputs({"status": "loaded"})
        else:
            processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID, use_fast=False)
            clip_model = CLIPModel.from_pretrained(CLIP_MODEL_ID, low_cpu_mem_usage=False)
            clip_model.eval()

        # --- span: extract embeddings ---
        if mlflow_run is not None:
            with mlflow_run.start_span("extract_embeddings") as span:
                span.set_inputs(
                    {
                        "row_count": len(rows),
                        "batch_size": BATCH_SIZE,
                        "clip_model_id": CLIP_MODEL_ID,
                    }
                )
                X, y = extract_embeddings(rows, s3_client, processor, clip_model)
                span.set_outputs(
                    {"embeddings_shape": list(X.shape), "label_count": len(y)}
                )
        else:
            X, y = extract_embeddings(rows, s3_client, processor, clip_model)

        # --- span: train classifier ---
        if mlflow_run is not None:
            with mlflow_run.start_span("train_classifier") as span:
                span.set_inputs({"n_samples": len(y), "max_iter": MAX_ITER, "C": 1.0})
                clf, le, y_enc = train_classifier(X, y)
                train_acc = float((clf.predict(X) == y_enc).mean())
                classes = le.classes_.tolist()
                span.set_outputs(
                    {"train_accuracy": round(train_acc, 4), "classes": classes}
                )
        else:
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

        if mlflow_run is not None:
            mlflow_run.log_metrics(
                {
                    "training_samples": len(y),
                    "class_count": len(classes),
                    "train_accuracy": train_acc,
                }
            )

            # --- span: log and register model ---
            with mlflow_run.start_span("register_model") as span:
                span.set_inputs(
                    {
                        "model_name": MLFLOW_MODEL_NAME,
                        "alias": "champion",
                        "training_samples": len(y),
                    }
                )

                with tempfile.TemporaryDirectory() as tmpdir:
                    bundle_path = os.path.join(tmpdir, "bundle")
                    metadata_path = os.path.join(tmpdir, "metadata")
                    joblib.dump({"classifier": clf, "label_encoder": le}, bundle_path)
                    with open(metadata_path, "w", encoding="utf-8") as fh:
                        json.dump(metadata, fh, indent=2)

                    class _Bundle(mlflow_run.pyfunc.PythonModel):
                        def predict(self, context, model_input, params=None):
                            raise NotImplementedError

                    mlflow_run.pyfunc.log_model(
                        artifact_path="model",
                        python_model=_Bundle(),
                        artifacts={"bundle": bundle_path, "metadata": metadata_path},
                        signature=build_mlflow_model_signature(),
                    )

                run_id = mlflow_run.active_run().info.run_id
                version = mlflow_run.register_model(
                    model_uri=f"runs:/{run_id}/model",
                    name=MLFLOW_MODEL_NAME,
                )
                mlflow_run.MlflowClient().set_registered_model_alias(
                    MLFLOW_MODEL_NAME, "champion", str(version.version)
                )
                registered_model_uri = f"models:/{MLFLOW_MODEL_NAME}@champion"
                span.set_outputs(
                    {
                        "registered_model_uri": registered_model_uri,
                        "model_version": str(version.version),
                    }
                )

            mlflow_run.log_dict(metadata, "metadata.json")
            mlflow_run.set_tags(
                {
                    "registered_model_uri": registered_model_uri,
                    "run_ts": run_ts,
                    "engine": "daft",
                    "domain": "vietjetair",
                }
            )

    with maybe_open_dagster_pipes() as pipes:
        if pipes is not None:
            pipes.report_asset_materialization(
                asset_key="vietjetair_baggage_damage_model",
                metadata={
                    "registered_model_uri": registered_model_uri,
                    "training_samples": len(y),
                    "classes": ", ".join(classes),
                    "train_accuracy": train_acc,
                    "clip_model_id": CLIP_MODEL_ID,
                    "run_ts": run_ts,
                },
            )


if __name__ == "__main__":
    main()
