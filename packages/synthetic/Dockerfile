FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
COPY server.ts ./

EXPOSE 3000
CMD ["bun", "server.ts"]
