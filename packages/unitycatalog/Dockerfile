ARG UC_VERSION=v0.4.0
ARG POSTGRES_JDBC_VERSION=42.7.4

FROM eclipse-temurin:17-jdk-jammy AS builder

ARG UC_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git tar \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.sbt \
    && cat <<'EOF' > /root/.sbt/repositories
[repositories]
local
maven-central: https://repo.maven.apache.org/maven2/
sbt-maven-releases: https://repo.scala-sbt.org/scalasbt/maven-releases/
sbt-maven-snapshots: https://repo.scala-sbt.org/scalasbt/maven-snapshots/
typesafe-ivy-releases: https://repo.typesafe.com/typesafe/ivy-releases/, [organization]/[module]/[revision]/[type]s/[artifact](-[classifier]).[ext]
EOF

ENV COURSIER_REPOSITORIES="https://repo.maven.apache.org/maven2|https://repo.scala-sbt.org/scalasbt/maven-releases|https://repo.scala-sbt.org/scalasbt/maven-snapshots|https://repo.typesafe.com/typesafe/ivy-releases"

WORKDIR /src

RUN git clone --branch "${UC_VERSION}" --depth 1 https://github.com/unitycatalog/unitycatalog.git

WORKDIR /src/unitycatalog

RUN curl -fsSL \
      -o build/sbt-launch-1.9.9.jar \
      https://repo.maven.apache.org/maven2/org/scala-sbt/sbt-launch/1.9.9/sbt-launch-1.9.9.jar

RUN build/sbt \
      -Dsbt.override.build.repos=true \
      -Dsbt.repository.config=/root/.sbt/repositories \
      createTarball

FROM eclipse-temurin:17-jre-jammy

ARG UC_VERSION
ARG POSTGRES_JDBC_VERSION

ENV UC_HOME=/home/unitycatalog
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${UC_HOME}/bin:${PATH}"

RUN useradd --create-home --home-dir "${UC_HOME}" --shell /bin/bash unitycatalog

WORKDIR /tmp

COPY --from=builder /src/unitycatalog/target/unitycatalog-*.tar.gz /tmp/

RUN tar -xzf /tmp/unitycatalog-*.tar.gz --strip-components=1 -C "${UC_HOME}" \
    && rm /tmp/unitycatalog-*.tar.gz

ADD "https://repo1.maven.org/maven2/org/postgresql/postgresql/${POSTGRES_JDBC_VERSION}/postgresql-${POSTGRES_JDBC_VERSION}.jar" \
    "${UC_HOME}/jars/postgresql-${POSTGRES_JDBC_VERSION}.jar"

RUN printf ':%s' "${UC_HOME}/jars/postgresql-${POSTGRES_JDBC_VERSION}.jar" >> "${UC_HOME}/jars/classpath" \
    && chown -R unitycatalog:unitycatalog "${UC_HOME}"

USER unitycatalog

WORKDIR ${UC_HOME}

EXPOSE 8080 8081

ENTRYPOINT ["bin/start-uc-server"]
