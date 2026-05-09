import os


PIPELINE_DIR = "/opt/spark/pipelines"

MEDALLION_SPEC = f"{PIPELINE_DIR}/medallion_pipeline/spark-pipeline.yaml"
CUSTOMER_SPEC = f"{PIPELINE_DIR}/customer_pipeline/customer-pipeline.yaml"
WEEKLY_SPEC = f"{PIPELINE_DIR}/weekly_pipeline/weekly-pipeline.yaml"

MEDALLION_DIR = f"{PIPELINE_DIR}/medallion_pipeline"
CUSTOMER_DIR = f"{PIPELINE_DIR}/customer_pipeline"
WEEKLY_DIR = f"{PIPELINE_DIR}/weekly_pipeline"

S3A_ENDPOINT = "http://rustfs-svc.rustfs.svc.cluster.local:9000"
S3A_ACCESS_KEY = "rustfsadmin"
S3A_SECRET_KEY = "rustfsadmin"

SPARK_IMAGE = "mizumi-spark-rustfs:4.1.1"
DAFT_IMAGE = "mizumi-daft:0.7.10"
DATAFUSION_IMAGE = "mizumi-datafusion:50.1.0"
DUCKDB_IMAGE = "mizumi-duckdb:1.1.3"
DAFT_RAY_ADDRESS = os.getenv(
    "DAFT_RAY_ADDRESS",
    "ray://daft-distributed-quickstart-head.daft.svc.cluster.local:10001",
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
