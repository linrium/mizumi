ARG GO_VERSION=1.26.4

FROM golang:${GO_VERSION}-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/chronicle .

FROM alpine:3.22

RUN addgroup -S -g 65532 chronicle && adduser -S -D -H -u 65532 -G chronicle chronicle

WORKDIR /app
COPY --from=build /out/chronicle /app/chronicle

RUN mkdir -p /var/lib/chronicle/tessera && chown -R chronicle:chronicle /var/lib/chronicle

USER chronicle

ENV CHRONICLE_ADDR=:3000
ENV CHRONICLE_LOG_DIR=/var/lib/chronicle/tessera

EXPOSE 3000

ENTRYPOINT ["/app/chronicle"]
