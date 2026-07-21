S3A_ENDPOINT = "http://rustfs-svc.rustfs.svc.cluster.local:9000"
S3A_ACCESS_KEY = "rustfsadmin"
S3A_SECRET_KEY = "rustfsadmin"
MLFLOW_TRACKING_URI = "http://mlflow-svc.mlflow.svc.cluster.local:5000"
MLFLOW_EXPERIMENT_NAME = "vietjetair-baggage-damage"
SIGNOZ_INSTRUMENTATION = "signoz-infra/signoz-instrumentation"
OTEL_EXPORTER_OTLP_ENDPOINT = "http://signoz-ingester.signoz.svc.cluster.local:4318"
OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf"
OTEL_DEPLOYMENT_ENVIRONMENT = "development"
OTEL_CLUSTER_NAME = "mizumi"

SPARK_IMAGE = "mizumi-spark-rustfs:4.1.3"
DAFT_IMAGE = "mizumi-daft:0.7.10"
DAFT_BAGGAGE_CLASSIFIER_IMAGE = "mizumi-daft-baggage-classifier:0.1.0"
DAFT_BAGGAGE_DAMAGE_TRAINER_IMAGE = "mizumi-daft-baggage-damage-trainer:0.1.0"

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
    "--conf",
    "spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension",
    "--conf",
    "spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog",
]
