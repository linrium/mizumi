FROM rust:1.88-slim-bookworm AS builder

WORKDIR /build/packages/uc

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY packages/uc/Cargo.toml packages/uc/Cargo.lock ./
COPY packages/uc/src ./src
COPY packages/uc/migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --home-dir /app --shell /usr/sbin/nologin uc

WORKDIR /app

COPY --from=builder /build/packages/uc/target/release/unitycatalog-server /usr/local/bin/unitycatalog-server
COPY packages/uc/config/server.toml ./config/server.toml

RUN chown -R uc:uc /app

USER uc

EXPOSE 8080

CMD ["unitycatalog-server"]
