FROM spark:3.5.8-python3

USER root

COPY jobs /opt/spark/jobs
RUN chown -R spark:spark /opt/spark/jobs

USER spark
