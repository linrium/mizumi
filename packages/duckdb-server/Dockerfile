FROM rust:1.88-slim-bookworm AS duckdb-build

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

WORKDIR /src/duckdb-uc-extension
COPY packages/duckdb-uc-extension/ ./
RUN git submodule update --init --recursive
RUN make release

FROM rust:1.88-slim-bookworm AS server-build

WORKDIR /src/duckdb-server
COPY packages/duckdb-server/Cargo.toml packages/duckdb-server/Cargo.lock ./
COPY packages/duckdb-server/src ./src
RUN cargo build --release

FROM debian:bookworm-slim

ENV DUCKDB_BIN=/usr/local/bin/duckdb

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libcurl4 \
        libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=duckdb-build /src/duckdb-uc-extension/build/release/duckdb /usr/local/bin/duckdb
COPY --from=server-build /src/duckdb-server/target/release/duckdb-server /usr/local/bin/duckdb-server

WORKDIR /opt/duckdb-server
EXPOSE 8080
CMD ["duckdb-server"]
