#!/usr/bin/env bash
set -euo pipefail

#─── colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[1;34m'
CYN='\033[0;36m'
BLD='\033[1m'
NC='\033[0m'

#─── service definitions: "label|namespace|service|port-pairs..." ───────────────
# port-pairs is one or more space-separated local:remote pairs passed directly
# to kubectl port-forward.
FORWARD_ADDRESS="${MIZUMI_FORWARD_ADDRESS:-0.0.0.0}"
SIGNOZ_NAMESPACE="${SIGNOZ_NAMESPACE:-signoz}"
SIGNOZ_UI_PORT="${SIGNOZ_UI_PORT:-8084}"
SIGNOZ_OPAMP_PORT="${SIGNOZ_OPAMP_PORT:-4320}"
SIGNOZ_OTLP_GRPC_PORT="${SIGNOZ_OTLP_GRPC_PORT:-4317}"
SIGNOZ_OTLP_HTTP_PORT="${SIGNOZ_OTLP_HTTP_PORT:-4318}"
SIGNOZ_INGESTER_HEALTH_PORT="${SIGNOZ_INGESTER_HEALTH_PORT:-13133}"
SIGNOZ_CLICKHOUSE_HTTP_PORT="${SIGNOZ_CLICKHOUSE_HTTP_PORT:-8123}"
SIGNOZ_CLICKHOUSE_NATIVE_PORT="${SIGNOZ_CLICKHOUSE_NATIVE_PORT:-9002}"
SIGNOZ_POSTGRES_PORT="${SIGNOZ_POSTGRES_PORT:-5434}"

SERVICES=(
  "RustFS S3 + Console|rustfs|rustfs-svc|9000:9000 9001:9001"
  "Redpanda Kafka + Admin|redpanda|redpanda-svc|19092:19092 9644:9644"
  "Redpanda UI|redpanda|redpanda-console-svc|8081:8080"
  "Keycloak|keycloak|keycloak-svc|8080:8080 8083:8080"
  "Dagster UI|dagster|dagster-dagster-webserver|8088:80"
  "MLflow UI|ml|mlflow-svc|5000:5000"
  "Unity Catalog API|unitycatalog|unitycatalog-svc|8082:8080"
  "Shared Postgres|shared-postgres|shared-postgres-svc|5433:5432"
  "DuckDB Quack|spark|duckdb-server-svc|8090:9494"
  "Controlplane API|controlplane|controlplane-svc|4000:4000"
  "WebUI|webui|webui-svc|3000:3000"
  "LanceDB|lancedb|lancedb-svc|8091:8080"
  "Synthetic API|synthetic|synthetic-server-svc|8092:8092"
  "SigNoz UI + OpAMP|${SIGNOZ_NAMESPACE}|signoz-signoz|${SIGNOZ_UI_PORT}:8080 ${SIGNOZ_OPAMP_PORT}:4320"
  "SigNoz OTLP + Health|${SIGNOZ_NAMESPACE}|signoz-ingester|${SIGNOZ_OTLP_GRPC_PORT}:4317 ${SIGNOZ_OTLP_HTTP_PORT}:4318 ${SIGNOZ_INGESTER_HEALTH_PORT}:13133"
  "SigNoz ClickHouse|${SIGNOZ_NAMESPACE}|signoz-clickhouse|${SIGNOZ_CLICKHOUSE_HTTP_PORT}:8123 ${SIGNOZ_CLICKHOUSE_NATIVE_PORT}:9000"
  "SigNoz PostgreSQL|${SIGNOZ_NAMESPACE}|signoz-metastore|${SIGNOZ_POSTGRES_PORT}:5432"
)

#─── cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  printf "\n${YLW}Stopping all port-forwards...${NC}\n"
  local pids
  # shellcheck disable=SC2046
  kill $(jobs -p 2>/dev/null) 2>/dev/null || true
  wait 2>/dev/null || true
  printf "${GRN}Stopped.${NC}\n"
}
trap cleanup EXIT INT TERM

#─── forward loop ──────────────────────────────────────────────────────────────
# Wraps kubectl port-forward in a restart loop so transient pod restarts or
# network blips don't drop the tunnel permanently.
_forward_loop() {
  local ns="$1" svc="$2"
  shift 2
  local log="/tmp/mizumi-pf-${ns}-${svc}.log"
  while true; do
    kubectl port-forward --address "$FORWARD_ADDRESS" -n "$ns" svc/"$svc" "$@" >"$log" 2>&1 || true
    sleep 3
  done
}

_local_ports() {
  local mapping
  for mapping in "$@"; do
    printf '%s\n' "${mapping%%:*}"
  done
}

#─── main ──────────────────────────────────────────────────────────────────────
printf "${BLU}${BLD}Mizumi port-forward${NC}\n\n"

STARTED=0
SKIPPED=0
USED_PORTS=" "

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r label ns svc ports_str <<< "$entry"
  # The port list is intentionally word-split for duplicate-port checks.
  # shellcheck disable=SC2086
  ports=($ports_str)
  conflict_port=""
  for port in $(_local_ports "${ports[@]}"); do
    case "$USED_PORTS" in
      *" $port "*) conflict_port="$port" ;;
    esac
  done
  if [[ -n "$conflict_port" ]]; then
    printf "  ${YLW}⚠${NC}  %-30s  skipped (local port %s already assigned)\n" "$label" "$conflict_port"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if kubectl get svc "$svc" -n "$ns" >/dev/null 2>&1; then
    _forward_loop "$ns" "$svc" "${ports[@]}" &
    printf "  ${GRN}✓${NC}  %-30s  ${CYN}%s${NC}\n" "$label" "$ports_str"
    STARTED=$((STARTED + 1))
    for port in $(_local_ports "${ports[@]}"); do
      USED_PORTS="${USED_PORTS}${port} "
    done
  else
    printf "  ${YLW}⚠${NC}  %-30s  skipped (svc/%s not found in %s)\n" "$label" "$svc" "$ns"
    SKIPPED=$((SKIPPED + 1))
  fi
done

printf "\n  Started: ${GRN}${BLD}%d${NC}  Skipped: ${YLW}%d${NC}\n" "$STARTED" "$SKIPPED"
printf "  Bind address: ${CYN}%s${NC}\n" "$FORWARD_ADDRESS"

#─── endpoint table ────────────────────────────────────────────────────────────
printf "\n${BLU}${BLD}─── Endpoints ──────────────────────────────────────────────────────${NC}\n"
printf "  ${BLD}%-24s${NC}  %s\n" "RustFS S3 API"     "http://127.0.0.1:9000"
printf "  ${BLD}%-24s${NC}  %s\n" "RustFS Console"    "http://127.0.0.1:9001"
printf "  ${BLD}%-24s${NC}  %s\n" "Redpanda Kafka"    "127.0.0.1:19092"
printf "  ${BLD}%-24s${NC}  %s\n" "Redpanda Admin"    "http://127.0.0.1:9644"
printf "  ${BLD}%-24s${NC}  %s\n" "Redpanda UI"       "http://127.0.0.1:8081"
printf "  ${BLD}%-24s${NC}  %s\n" "Keycloak"          "http://127.0.0.1:8080"
printf "  ${BLD}%-24s${NC}  %s\n" "Dagster UI"        "http://127.0.0.1:8088"
printf "  ${BLD}%-24s${NC}  %s\n" "Dagster GraphQL"   "http://127.0.0.1:8088/graphql"
printf "  ${BLD}%-24s${NC}  %s\n" "MLflow UI"         "http://127.0.0.1:5000"
printf "  ${BLD}%-24s${NC}  %s\n" "Unity Catalog API" "http://127.0.0.1:8082"
printf "  ${BLD}%-24s${NC}  %s\n" "DuckDB Server"     "http://127.0.0.1:8090"
printf "  ${BLD}%-24s${NC}  %s\n" "Controlplane API"  "http://127.0.0.1:4000"
printf "  ${BLD}%-24s${NC}  %s\n" "WebUI"             "http://127.0.0.1:3000"
printf "  ${BLD}%-24s${NC}  %s\n" "LanceDB"           "http://127.0.0.1:8091"
printf "  ${BLD}%-24s${NC}  %s\n" "Synthetic API"     "http://127.0.0.1:8092"
printf "  ${BLD}%-24s${NC}  %s\n" "Shared Postgres"   "localhost:5433"
if [[ "$FORWARD_ADDRESS" == "0.0.0.0" || "$FORWARD_ADDRESS" == *","* ]]; then
  printf "  ${BLD}%-24s${NC}  %s\n" "WebUI via host IP" "http://<your-host-ip>:3000"
fi
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz UI"         "http://127.0.0.1:${SIGNOZ_UI_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz OpAMP"      "127.0.0.1:${SIGNOZ_OPAMP_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz OTLP gRPC"  "127.0.0.1:${SIGNOZ_OTLP_GRPC_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz OTLP HTTP"  "http://127.0.0.1:${SIGNOZ_OTLP_HTTP_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz Health"     "http://127.0.0.1:${SIGNOZ_INGESTER_HEALTH_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz ClickHouse" "http://127.0.0.1:${SIGNOZ_CLICKHOUSE_HTTP_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz CH Native"  "127.0.0.1:${SIGNOZ_CLICKHOUSE_NATIVE_PORT}"
printf "  ${BLD}%-24s${NC}  %s\n" "SigNoz PostgreSQL" "127.0.0.1:${SIGNOZ_POSTGRES_PORT}"
printf "${BLU}${BLD}────────────────────────────────────────────────────────────────────${NC}\n"
printf "\n  Port-forwards auto-restart on failure. ${YLW}Ctrl-C${NC} to stop.\n\n"

wait
