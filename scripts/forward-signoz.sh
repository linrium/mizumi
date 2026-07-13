#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${SIGNOZ_NAMESPACE:-signoz}"

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
CYN='\033[0;36m'
BLD='\033[1m'
NC='\033[0m'

# label|service|local:remote port mappings
SERVICES=(
  "SigNoz UI + OpAMP|signoz-signoz|${SIGNOZ_UI_PORT:-8080}:8080 ${SIGNOZ_OPAMP_PORT:-4320}:4320"
  "OTLP gRPC + HTTP + health|signoz-ingester|${SIGNOZ_OTLP_GRPC_PORT:-4317}:4317 ${SIGNOZ_OTLP_HTTP_PORT:-4318}:4318 ${SIGNOZ_INGESTER_HEALTH_PORT:-13133}:13133"
  "ClickHouse HTTP + native|signoz-clickhouse|${SIGNOZ_CLICKHOUSE_HTTP_PORT:-8123}:8123 ${SIGNOZ_CLICKHOUSE_NATIVE_PORT:-9000}:9000"
  "SigNoz PostgreSQL|signoz-metastore|${SIGNOZ_POSTGRES_PORT:-5434}:5432"
)

log_file() {
  printf '/tmp/mizumi-signoz-pf-%s.log' "$1"
}

cleanup() {
  printf "\n${YLW}Stopping SigNoz port-forwards...${NC}\n"
  local pid
  for pid in $(jobs -p 2>/dev/null); do
    kill "${pid}" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  printf "${GRN}Stopped.${NC}\n"
}
trap cleanup EXIT INT TERM

forward_loop() {
  local service="$1"
  shift
  local log
  log="$(log_file "${service}")"

  while true; do
    kubectl port-forward \
      --namespace "${NAMESPACE}" \
      "service/${service}" "$@" >"${log}" 2>&1 || true
    sleep 2
  done
}

command -v kubectl >/dev/null 2>&1 || {
  printf "${RED}error:${NC} kubectl is not installed or not in PATH\n" >&2
  exit 1
}

kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || {
  printf "${RED}error:${NC} namespace %s does not exist\n" "${NAMESPACE}" >&2
  exit 1
}

printf "${BLD}SigNoz port-forward${NC} (namespace: ${CYN}%s${NC})\n\n" "${NAMESPACE}"

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r label service ports <<< "${entry}"
  if ! kubectl get service "${service}" --namespace "${NAMESPACE}" >/dev/null 2>&1; then
    printf "  ${YLW}⚠${NC}  %-30s service/%s not found\n" "${label}" "${service}"
    continue
  fi

  # The port list is intentionally word-split into kubectl arguments.
  # shellcheck disable=SC2086
  forward_loop "${service}" ${ports} &
  printf "  ${GRN}✓${NC}  %-30s ${CYN}%s${NC}\n" "${label}" "${ports}"
done

printf "\n${BLD}Endpoints${NC}\n"
printf "  SigNoz UI          http://127.0.0.1:%s\n" "${SIGNOZ_UI_PORT:-8080}"
printf "  OTLP gRPC          127.0.0.1:%s\n" "${SIGNOZ_OTLP_GRPC_PORT:-4317}"
printf "  OTLP HTTP          http://127.0.0.1:%s\n" "${SIGNOZ_OTLP_HTTP_PORT:-4318}"
printf "  ClickHouse HTTP    http://127.0.0.1:%s\n" "${SIGNOZ_CLICKHOUSE_HTTP_PORT:-8123}"
printf "  ClickHouse native  127.0.0.1:%s\n" "${SIGNOZ_CLICKHOUSE_NATIVE_PORT:-9000}"
printf "  PostgreSQL         127.0.0.1:%s\n" "${SIGNOZ_POSTGRES_PORT:-5434}"
printf "\nPort-forwards restart automatically. Press ${YLW}Ctrl-C${NC} to stop.\n"

wait
