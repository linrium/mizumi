FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/opt/hf-cache

RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "boto3>=1.35,<2" \
    "joblib>=1.4,<2" \
    "mlflow>=2.17,<4" \
    "numpy>=1.26,<3" \
    "pillow>=11,<12" \
    "python-multipart>=0.0.20,<1" \
    "ray[serve]>=2.30,<3" \
    "safetensors>=0.5,<1" \
    "scikit-learn>=1.5,<2" \
    "torch>=2.4,<3" \
    "transformers>=4.52,<5"

RUN mkdir -p /opt/baggage-model-server "$HF_HOME"
COPY serve_app.py /opt/baggage-model-server/serve_app.py

WORKDIR /opt/baggage-model-server
