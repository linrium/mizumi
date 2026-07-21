FROM python:3.12-slim AS duckdb-build

ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        curl \
        git \
        libcurl4-openssl-dev \
        libssl-dev \
        ninja-build \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.88.0

WORKDIR /src/duckdb-uc-extension
COPY packages/duckdb-uc-extension/ ./
RUN git submodule update --init --recursive
RUN make release

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV DUCKDB_BIN=/usr/local/bin/duckdb

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libcurl4 \
        libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "fastapi" "uvicorn[standard]"

COPY --from=duckdb-build /src/duckdb-uc-extension/build/release/duckdb /usr/local/bin/duckdb
COPY packages/duckdb-server/server.py /opt/duckdb-server/server.py

WORKDIR /opt/duckdb-server
EXPOSE 8080
CMD ["python", "server.py"]
