S3A_ENDPOINT = "http://rustfs-svc.rustfs.svc.cluster.local:9000"
S3A_ACCESS_KEY = "rustfsadmin"
S3A_SECRET_KEY = "rustfsadmin"

SPARK_IMAGE = "mizumi-spark-rustfs:4.1.1"
DAFT_IMAGE = "mizumi-daft:0.7.10"

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
