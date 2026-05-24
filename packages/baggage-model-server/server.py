from __future__ import annotations

import io
import json
import os
from functools import lru_cache
from typing import Any

import joblib
import mlflow
import torch
from fastapi import FastAPI, File, HTTPException, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from transformers import CLIPModel, CLIPProcessor

MLFLOW_TRACKING_URI = os.getenv(
    "MLFLOW_TRACKING_URI",
    "http://mlflow-svc.mlflow.svc.cluster.local:5000",
)
MLFLOW_EXPERIMENT_NAME = os.getenv(
    "MLFLOW_EXPERIMENT_NAME",
    "vietjetair-baggage-damage",
)
# Explicit MLflow artifact URI (e.g. "runs:/<run_id>/model" or "models:/<name>/<version>").
# When unset the server picks the latest successful run in MLFLOW_EXPERIMENT_NAME.
MODEL_URI = os.getenv("MODEL_URI", "")

app = FastAPI(title="VietJet Air baggage damage model")


def _resolve_artifact_uri() -> tuple[str, str]:
    """Return (artifact_uri, run_id) for the model artifacts."""
    client = mlflow.MlflowClient()

    if MODEL_URI:
        # User supplied an explicit URI — parse the run_id from it for display.
        run_id = ""
        if MODEL_URI.startswith("runs:/"):
            run_id = MODEL_URI.split("/")[1]
        return MODEL_URI, run_id

    experiment = client.get_experiment_by_name(MLFLOW_EXPERIMENT_NAME)
    if experiment is None:
        raise RuntimeError(
            f"MLflow experiment {MLFLOW_EXPERIMENT_NAME!r} not found at {MLFLOW_TRACKING_URI}"
        )
    runs = client.search_runs(
        experiment_ids=[experiment.experiment_id],
        filter_string="status = 'FINISHED'",
        order_by=["start_time DESC"],
        max_results=1,
    )
    if not runs:
        raise RuntimeError(
            f"No finished runs found in experiment {MLFLOW_EXPERIMENT_NAME!r}"
        )
    run = runs[0]
    return f"runs:/{run.info.run_id}/model", run.info.run_id


@lru_cache(maxsize=1)
def load_runtime() -> dict[str, Any]:
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    artifact_uri, run_id = _resolve_artifact_uri()

    local_dir = mlflow.artifacts.download_artifacts(artifact_uri=artifact_uri)
    artifact = joblib.load(os.path.join(local_dir, "model.joblib"))
    with open(os.path.join(local_dir, "metadata.json"), encoding="utf-8") as fh:
        metadata = json.load(fh)

    clip_model_id = metadata.get("clip_model_id") or "openai/clip-vit-base-patch32"
    processor = CLIPProcessor.from_pretrained(clip_model_id, use_fast=False)
    clip_model = CLIPModel.from_pretrained(clip_model_id, low_cpu_mem_usage=False)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    clip_model.to(device)
    clip_model.eval()

    return {
        "classifier": artifact["classifier"],
        "label_encoder": artifact["label_encoder"],
        "metadata": metadata,
        "processor": processor,
        "clip_model": clip_model,
        "device": device,
        "artifact_uri": artifact_uri,
        "run_id": run_id,
    }


def load_image(payload: bytes) -> Image.Image:
    try:
        return Image.open(io.BytesIO(payload)).convert("RGB")
    except (OSError, UnidentifiedImageError) as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image") from exc


@app.get("/livez")
def livez() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readyz(response: Response) -> dict[str, Any]:
    try:
        runtime = load_runtime()
    except Exception as exc:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unavailable",
            "mlflow_tracking_uri": MLFLOW_TRACKING_URI,
            "experiment": MLFLOW_EXPERIMENT_NAME,
            "error": str(exc),
        }
    return {
        "status": "ready",
        "artifact_uri": runtime["artifact_uri"],
        "run_id": runtime["run_id"],
        "metadata": runtime["metadata"],
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    runtime = load_runtime()
    image = load_image(payload)
    processor: CLIPProcessor = runtime["processor"]
    clip_model: CLIPModel = runtime["clip_model"]
    classifier = runtime["classifier"]
    label_encoder = runtime["label_encoder"]

    inputs = processor(images=[image], return_tensors="pt", padding=True)
    inputs = {key: value.to(runtime["device"]) for key, value in inputs.items()}
    with torch.no_grad():
        feats = clip_model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    embedding = feats.cpu().numpy()

    probabilities = classifier.predict_proba(embedding)[0]
    ranked_indices = probabilities.argsort()[::-1]
    rankings = [
        {
            "label": str(label_encoder.inverse_transform([int(idx)])[0]),
            "score": round(float(probabilities[idx]), 6),
        }
        for idx in ranked_indices
    ]

    top = rankings[0]
    return {
        "label": top["label"],
        "score": top["score"],
        "rankings": rankings,
        "artifact_uri": runtime["artifact_uri"],
        "run_id": runtime["run_id"],
        "metadata": runtime["metadata"],
    }
