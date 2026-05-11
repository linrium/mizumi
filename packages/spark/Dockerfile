FROM spark:4.1.1-python3

USER root

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
ADD https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.13/4.1.1/spark-sql-kafka-0-10_2.13-4.1.1.jar /opt/spark/jars/spark-sql-kafka-0-10_2.13-4.1.1.jar
ADD https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.13/4.1.1/spark-token-provider-kafka-0-10_2.13-4.1.1.jar /opt/spark/jars/spark-token-provider-kafka-0-10_2.13-4.1.1.jar
ADD https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/3.9.1/kafka-clients-3.9.1.jar /opt/spark/jars/kafka-clients-3.9.1.jar
ADD https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/2.12.0/commons-pool2-2.12.0.jar /opt/spark/jars/commons-pool2-2.12.0.jar
RUN chmod 644 \
    /opt/spark/jars/unitycatalog-spark_2.13-0.4.1.jar \
    /opt/spark/jars/unitycatalog-client-0.4.1.jar \
    /opt/spark/jars/delta-spark_2.13-4.1.0.jar \
    /opt/spark/jars/delta-storage-4.1.0.jar \
    /opt/spark/jars/jackson-databind-nullable-0.2.6.jar \
    /opt/spark/jars/spark-sql-kafka-0-10_2.13-4.1.1.jar \
    /opt/spark/jars/spark-token-provider-kafka-0-10_2.13-4.1.1.jar \
    /opt/spark/jars/kafka-clients-3.9.1.jar \
    /opt/spark/jars/commons-pool2-2.12.0.jar

RUN pip install --no-cache-dir \
    "pyspark[pipelines]==4.1.1" \
    "pyspark-connect==4.1.1" \
    "grpcio>=1.48.1" \
    "grpcio-status>=1.48.1" \
    "pandas>=2.2.0" \
    "pyarrow>=15.0.0" \
    "pyyaml>=6.0" \
    "zstandard>=0.25.0" \
    "dagster-pipes"

COPY jobs /opt/spark/jobs
COPY pipelines /opt/spark/pipelines
COPY conf/log4j2.properties /opt/spark/conf/log4j2.properties
COPY conf/spark-defaults.conf /opt/spark/conf/spark-defaults.conf
RUN chown -R spark:spark /opt/spark/jobs /opt/spark/pipelines /opt/spark/conf/log4j2.properties /opt/spark/conf/spark-defaults.conf

USER spark
