FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/opt/hf-cache

RUN pip install --no-cache-dir \
    "boto3>=1.43.6,<2" \
    "fastapi[standard]>=0.115,<1" \
    "joblib>=1.4,<2" \
    "numpy>=1.26,<3" \
    "pillow>=11,<12" \
    "python-multipart>=0.0.20,<1" \
    "safetensors>=0.5,<1" \
    "scikit-learn>=1.5,<2" \
    "torch>=2.4,<3" \
    "transformers>=4.52,<5"

RUN mkdir -p /opt/baggage-model-server "$HF_HOME"
COPY server.py /opt/baggage-model-server/server.py

WORKDIR /opt/baggage-model-server

CMD ["fastapi", "run", "server.py", "--host", "0.0.0.0", "--port", "8080"]
