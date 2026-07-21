# syntax=docker/dockerfile:1.7

FROM rust:1.88-slim-bookworm AS duckdb-build

ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        bash \
        ca-certificates \
        cmake \
        curl \
        git \
        libcurl4-openssl-dev \
        libssl-dev \
        ninja-build \
        pkg-config \
        python3

WORKDIR /src/duckdb-uc-extension
COPY packages/duckdb-uc-extension/ ./
RUN --mount=type=cache,target=/root/.cache/git \
    git submodule update --init --recursive
RUN --mount=type=cache,target=/src/duckdb-uc-extension/build \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    bash -o pipefail -c '\
        rm -f build/release/CMakeCache.txt \
        && rm -rf build/release/CMakeFiles build/release/_deps/*-subbuild \
        && rm -rf build/release/_deps/*-populate-prefix \
        && rm -rf build/release/_deps/*-populate-stamp \
        && make release 2>&1 | tee /tmp/duckdb-extension-build.log \
    ' || ( \
        echo "===== make release output =====" \
        && cat /tmp/duckdb-extension-build.log \
        && find build/release -maxdepth 5 \( -name 'CMakeError.log' -o -name '*configure*.log' \) -print -exec sh -c 'echo "===== $1 ====="; cat "$1"' sh {} \; \
        && false \
    )
RUN --mount=type=cache,target=/src/duckdb-uc-extension/build \
    mkdir -p /out \
    && cp build/release/duckdb /out/duckdb

FROM rust:1.88-slim-bookworm AS server-build

WORKDIR /src/duckdb-server
COPY packages/duckdb-server/Cargo.toml packages/duckdb-server/Cargo.lock ./
COPY packages/duckdb-server/src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/duckdb-server/target \
    cargo build --release \
    && mkdir -p /out \
    && cp target/release/duckdb-server /out/duckdb-server

FROM debian:bookworm-slim

ENV DUCKDB_BIN=/usr/local/bin/duckdb
ENV DEBIAN_FRONTEND=noninteractive

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libcurl4 \
        libssl3

COPY --from=duckdb-build /out/duckdb /usr/local/bin/duckdb
COPY --from=server-build /out/duckdb-server /usr/local/bin/duckdb-server

WORKDIR /opt/duckdb-server
EXPOSE 8080
CMD ["duckdb-server"]
