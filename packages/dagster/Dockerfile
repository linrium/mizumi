FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

# Java runtime required by spark-pipelines (embedded Spark Connect server)
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
    "dagster-postgres" \
    "dagster-k8s" \
    "dagster-spark==0.29.4" \
    "pyspark[pipelines]==4.1.1" \
    "grpcio>=1.48.1" \
    "grpcio-status>=1.48.1" \
    "boto3"

# Copy JARs into pyspark's own jars dir so they land on the JVM bootstrap classpath
# at spark-pipelines startup — required for S3AFileSystem to be resolvable during
# SharedState init (before --jars is applied by the Spark classloader).
RUN cp /opt/spark/jars/*.jar \
    "$(python3 -c 'import pyspark, os; print(os.path.join(os.path.dirname(pyspark.__file__), "jars"))')"

# Wrapper: --jars must come before the subcommand so we can't use run_extra_args
RUN JARS="/opt/spark/jars/hadoop-aws-3.4.2.jar,/opt/spark/jars/aws-java-sdk-bundle-1.12.720.jar,/opt/spark/jars/bundle-2.29.52.jar,/opt/spark/jars/analyticsaccelerator-s3-1.2.1.jar,/opt/spark/jars/wildfly-openssl-2.1.4.Final.jar,/opt/spark/jars/slf4j-nop-1.7.36.jar,/opt/spark/jars/unitycatalog-spark_2.13-0.4.1.jar,/opt/spark/jars/unitycatalog-client-0.4.1.jar,/opt/spark/jars/delta-spark_2.13-4.1.0.jar,/opt/spark/jars/delta-storage-4.1.0.jar,/opt/spark/jars/jackson-databind-nullable-0.2.6.jar" \
    && printf '#!/bin/bash\nexec spark-pipelines --jars %s "$@"\n' "$JARS" > /usr/local/bin/spark-pipelines-s3 \
    && chmod +x /usr/local/bin/spark-pipelines-s3

# Spark conf (warehouse dir) read at JVM start via SPARK_CONF_DIR
ENV SPARK_CONF_DIR=/opt/spark/conf
RUN mkdir -p /opt/spark/conf /opt/spark/pipelines/definitions
COPY packages/dagster/conf/spark-defaults.conf /opt/spark/conf/spark-defaults.conf
COPY packages/spark/pipelines/spark-pipeline.yaml /opt/spark/pipelines/spark-pipeline.yaml
COPY packages/spark/pipelines/definitions/ /opt/spark/pipelines/definitions/

COPY packages/dagster/definitions.py /app/definitions.py

WORKDIR /app
EXPOSE 80
