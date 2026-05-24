from __future__ import annotations

import io
import json
import os
from functools import lru_cache
from typing import Any

import boto3
import joblib
import torch
from botocore.config import Config
from fastapi import FastAPI, File, HTTPException, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from transformers import CLIPModel, CLIPProcessor

MODEL_URI = os.getenv(
    "MODEL_URI",
    "s3://models/vietjetair/baggage-damage-classifier/20260524T112308Z",
)
RUSTFS_ENDPOINT_URL = os.getenv(
    "RUSTFS_ENDPOINT_URL",
    "http://rustfs-svc.rustfs.svc.cluster.local:9000",
)
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
RUSTFS_USE_SSL = os.getenv("RUSTFS_USE_SSL", "false").lower() == "true"

app = FastAPI(title="VietJet Air baggage damage model")


def parse_s3_uri(uri: str) -> tuple[str, str]:
    if not uri.startswith("s3://"):
        raise ValueError(f"MODEL_URI must be an s3:// URI, got {uri!r}")
    without_scheme = uri.removeprefix("s3://")
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        raise ValueError(f"MODEL_URI must include bucket and key prefix, got {uri!r}")
    return bucket, key.rstrip("/")


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


def read_s3_bytes(bucket: str, key: str) -> bytes:
    response = build_s3_client().get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


@lru_cache(maxsize=1)
def load_runtime() -> dict[str, Any]:
    bucket, prefix = parse_s3_uri(MODEL_URI)
    artifact = joblib.load(io.BytesIO(read_s3_bytes(bucket, f"{prefix}/model.joblib")))
    metadata = json.loads(read_s3_bytes(bucket, f"{prefix}/metadata.json").decode())

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
        return {"status": "unavailable", "model_uri": MODEL_URI, "error": str(exc)}
    return {
        "status": "ready",
        "model_uri": MODEL_URI,
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
        "model_uri": MODEL_URI,
        "metadata": runtime["metadata"],
    }
