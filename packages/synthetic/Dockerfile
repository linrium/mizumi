FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
COPY data/ ./data/
RUN test -d data/train
COPY server.ts index.ts generate.ts generate.config.json ./

EXPOSE 3000
CMD ["bun", "server.ts"]
