import os


PIPELINE_DIR = "/opt/spark/pipelines"

BANKING_TRANSACTIONS_SPEC = f"{PIPELINE_DIR}/banking_transactions_pipeline/spark-pipeline.yaml"
BANKING_RISK_SPEC = f"{PIPELINE_DIR}/banking_risk_pipeline/spark-pipeline.yaml"
BANKING_CUSTOMER_SPEC = f"{PIPELINE_DIR}/banking_customer_pipeline/spark-pipeline.yaml"

BANKING_TRANSACTIONS_DIR = f"{PIPELINE_DIR}/banking_transactions_pipeline"
BANKING_RISK_DIR = f"{PIPELINE_DIR}/banking_risk_pipeline"
BANKING_CUSTOMER_DIR = f"{PIPELINE_DIR}/banking_customer_pipeline"

S3A_ENDPOINT = "http://rustfs-svc.rustfs.svc.cluster.local:9000"
S3A_ACCESS_KEY = "rustfsadmin"
S3A_SECRET_KEY = "rustfsadmin"

SPARK_IMAGE = "mizumi-spark-rustfs:4.1.1"
DAFT_IMAGE = "mizumi-daft:0.7.10"
DAFT_RAY_ADDRESS = os.getenv(
    "DAFT_RAY_ADDRESS",
    "ray://daft-ray-cluster-head.daft.svc.cluster.local:10001",
)

S3A_CONF = [
    "--conf",
    "spark.hadoop.fs.s3a.impl=org.apache.hadoop.fs.s3a.S3AFileSystem",
    "--conf",
    f"spark.hadoop.fs.s3a.endpoint={S3A_ENDPOINT}",
    "--conf",
    "spark.hadoop.fs.s3a.path.style.access=true",
    "--conf",
    f"spark.hadoop.fs.s3a.access.key={S3A_ACCESS_KEY}",
    "--conf",
    f"spark.hadoop.fs.s3a.secret.key={S3A_SECRET_KEY}",
    "--conf",
    "spark.hadoop.fs.s3a.connection.ssl.enabled=false",
    "--conf",
    "spark.hadoop.fs.s3a.aws.credentials.provider=org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider",
]
