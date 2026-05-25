FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

# Java runtime for local Spark execution inside Dagster jobs
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/default-java

# S3A JARs — same set as the spark image so SparkPipelinesResource can reach RustFS
ADD https://repo1.maven.org/maven2/org/apache/hadoop/hadoop-aws/3.4.2/hadoop-aws-3.4.2.jar /opt/spark/jars/hadoop-aws-3.4.2.jar
ADD https://repo1.maven.org/maven2/com/amazonaws/aws-java-sdk-bundle/1.12.720/aws-java-sdk-bundle-1.12.720.jar /opt/spark/jars/aws-java-sdk-bundle-1.12.720.jar
ADD https://repo1.maven.org/maven2/software/amazon/awssdk/bundle/2.29.52/bundle-2.29.52.jar /opt/spark/jars/bundle-2.29.52.jar
ADD https://repo1.maven.org/maven2/software/amazon/s3/analyticsaccelerator/analyticsaccelerator-s3/1.2.1/analyticsaccelerator-s3-1.2.1.jar /opt/spark/jars/analyticsaccelerator-s3-1.2.1.jar
ADD https://repo1.maven.org/maven2/org/wildfly/openssl/wildfly-openssl/2.1.4.Final/wildfly-openssl-2.1.4.Final.jar /opt/spark/jars/wildfly-openssl-2.1.4.Final.jar
ADD https://repo1.maven.org/maven2/org/slf4j/slf4j-nop/1.7.36/slf4j-nop-1.7.36.jar /opt/spark/jars/slf4j-nop-1.7.36.jar
RUN chmod 644 \
    /opt/spark/jars/hadoop-aws-3.4.2.jar \
    /opt/spark/jars/aws-java-sdk-bundle-1.12.720.jar \
    /opt/spark/jars/bundle-2.29.52.jar \
    /opt/spark/jars/analyticsaccelerator-s3-1.2.1.jar \
    /opt/spark/jars/wildfly-openssl-2.1.4.Final.jar \
    /opt/spark/jars/slf4j-nop-1.7.36.jar

# Unity Catalog + Delta Lake connector
ADD https://repo1.maven.org/maven2/io/unitycatalog/unitycatalog-spark_2.13/0.4.1/unitycatalog-spark_2.13-0.4.1.jar /opt/spark/jars/unitycatalog-spark_2.13-0.4.1.jar
ADD https://repo1.maven.org/maven2/io/unitycatalog/unitycatalog-client/0.4.1/unitycatalog-client-0.4.1.jar /opt/spark/jars/unitycatalog-client-0.4.1.jar
ADD https://repo1.maven.org/maven2/io/delta/delta-spark_2.13/4.1.0/delta-spark_2.13-4.1.0.jar /opt/spark/jars/delta-spark_2.13-4.1.0.jar
ADD https://repo1.maven.org/maven2/io/delta/delta-storage/4.1.0/delta-storage-4.1.0.jar /opt/spark/jars/delta-storage-4.1.0.jar
ADD https://repo1.maven.org/maven2/org/openapitools/jackson-databind-nullable/0.2.6/jackson-databind-nullable-0.2.6.jar /opt/spark/jars/jackson-databind-nullable-0.2.6.jar
RUN chmod 644 \
    /opt/spark/jars/unitycatalog-spark_2.13-0.4.1.jar \
    /opt/spark/jars/unitycatalog-client-0.4.1.jar \
    /opt/spark/jars/delta-spark_2.13-4.1.0.jar \
    /opt/spark/jars/delta-storage-4.1.0.jar \
    /opt/spark/jars/jackson-databind-nullable-0.2.6.jar

RUN pip install --no-cache-dir \
    "dagster==1.13.4" \
    "dagster-postgres==0.29.4" \
    "dagster-k8s==0.29.4" \
    "dagster-spark==0.29.4" \
    "kubernetes>=35,<36" \
    "pyspark==4.1.1" \
    "grpcio>=1.48.1" \
    "grpcio-status>=1.48.1" \
    "boto3"

# Copy JARs into pyspark's own jars dir so they land on the JVM bootstrap classpath
# before Spark initializes the filesystem layer.
RUN cp /opt/spark/jars/*.jar \
    "$(python3 -c 'import pyspark, os; print(os.path.join(os.path.dirname(pyspark.__file__), "jars"))')"

# Static Spark configs used by the batch jobs that run from Dagster.
ENV JAVA_TOOL_OPTIONS="-Dspark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension -Dspark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog"

ENV SPARK_CONF_DIR=/opt/spark/conf
RUN mkdir -p /opt/spark/conf
COPY packages/dagster/conf/spark-defaults.conf /opt/spark/conf/spark-defaults.conf

COPY packages/dagster/definitions.py /app/definitions.py
COPY packages/dagster/defs_pkg/ /app/defs_pkg/

WORKDIR /app
EXPOSE 80
