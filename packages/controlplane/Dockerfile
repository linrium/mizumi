FROM rust:1.88-slim-bookworm AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y pkg-config libssl-dev cmake g++ libcurl4-openssl-dev && rm -rf /var/lib/apt/lists/*
COPY packages/controlplane/Cargo.toml packages/controlplane/Cargo.lock ./packages/controlplane/
WORKDIR /build/packages/controlplane
COPY packages/controlplane/src ./src
COPY packages/controlplane/migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /build/packages/controlplane/target/release/controlplane /usr/local/bin/controlplane
COPY packages/controlplane/config.toml /app/config.toml
COPY packages/spark/jobs /app/packages/spark/jobs
COPY packages/daft/jobs /app/packages/daft/jobs
COPY packages/dagster/defs_pkg/assets /app/packages/dagster/defs_pkg/assets
EXPOSE 4000
CMD ["controlplane"]
