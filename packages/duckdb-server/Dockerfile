# syntax=docker/dockerfile:1.7

FROM rust:1.88-slim-bookworm AS server-build

ENV DEBIAN_FRONTEND=noninteractive

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        pkg-config

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

ENV DEBIAN_FRONTEND=noninteractive

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libcurl4 \
        libssl3 \
        libstdc++6

COPY --from=server-build /out/duckdb-server /usr/local/bin/duckdb-server

WORKDIR /opt/duckdb-server
EXPOSE 8080
CMD ["duckdb-server"]
