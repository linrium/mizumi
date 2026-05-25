from __future__ import annotations

import io
import json
import os
from functools import lru_cache
from typing import Any

os.environ.setdefault("GIT_PYTHON_REFRESH", "quiet")

import joblib
import mlflow
import torch
from PIL import Image, UnidentifiedImageError
from ray import serve
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from transformers import CLIPModel, CLIPProcessor

MLFLOW_TRACKING_URI = os.getenv(
    "MLFLOW_TRACKING_URI",
    "http://mlflow-svc.ml.svc.cluster.local:5000",
)
MLFLOW_MODEL_NAME = os.getenv("MLFLOW_MODEL_NAME", "baggage-damage-detector")
MLFLOW_MODEL_ALIAS = os.getenv("MLFLOW_MODEL_ALIAS", "champion")


@lru_cache(maxsize=1)
def load_runtime() -> dict[str, Any]:
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    model_uri = f"models:/{MLFLOW_MODEL_NAME}@{MLFLOW_MODEL_ALIAS}"
    local_dir = mlflow.artifacts.download_artifacts(artifact_uri=model_uri)
    artifacts_dir = os.path.join(local_dir, "artifacts")

    artifact = joblib.load(os.path.join(artifacts_dir, "bundle"))
    with open(os.path.join(artifacts_dir, "metadata"), encoding="utf-8") as fh:
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
        "model_uri": model_uri,
    }


async def livez(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


async def readyz(request: Request) -> JSONResponse:
    try:
        runtime = load_runtime()
    except Exception as exc:
        return JSONResponse(
            {
                "status": "unavailable",
                "mlflow_tracking_uri": MLFLOW_TRACKING_URI,
                "model_uri": f"models:/{MLFLOW_MODEL_NAME}@{MLFLOW_MODEL_ALIAS}",
                "error": str(exc),
            },
            status_code=503,
        )
    return JSONResponse(
        {
            "status": "ready",
            "model_uri": runtime["model_uri"],
            "metadata": runtime["metadata"],
        }
    )


async def predict(request: Request) -> JSONResponse:
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        return JSONResponse({"detail": "Missing 'file' field"}, status_code=400)
    payload = await upload.read()
    if not payload:
        return JSONResponse({"detail": "Uploaded file is empty"}, status_code=400)
    try:
        image = Image.open(io.BytesIO(payload)).convert("RGB")
    except (OSError, UnidentifiedImageError):
        return JSONResponse(
            {"detail": "Uploaded file is not a valid image"}, status_code=400
        )

    runtime = load_runtime()
    processor: CLIPProcessor = runtime["processor"]
    clip_model: CLIPModel = runtime["clip_model"]
    classifier = runtime["classifier"]
    label_encoder = runtime["label_encoder"]

    inputs = processor(images=[image], return_tensors="pt", padding=True)
    inputs = {k: v.to(runtime["device"]) for k, v in inputs.items()}
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
    return JSONResponse(
        {
            "label": top["label"],
            "score": top["score"],
            "rankings": rankings,
            "model_uri": runtime["model_uri"],
            "metadata": runtime["metadata"],
        }
    )


_app = Starlette(
    routes=[
        Route("/livez", livez),
        Route("/readyz", readyz),
        Route("/predict", predict, methods=["POST"]),
    ]
)


@serve.deployment(
    num_replicas=1,
    ray_actor_options={"num_cpus": 1, "num_gpus": 0},
    health_check_period_s=15,
    health_check_timeout_s=30,
)
@serve.ingress(_app)
class BaggageModelDeployment:
    pass


deployment = BaggageModelDeployment.bind()
