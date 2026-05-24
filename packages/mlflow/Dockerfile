FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir \
    "boto3>=1.43.6,<2" \
    "mlflow>=2.17,<4" \
    "psycopg2-binary>=2.9,<3"

EXPOSE 5000

CMD ["mlflow", "server", "--host", "0.0.0.0", "--port", "5000"]
