#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[1;34m'
CYN='\033[0;36m'
BLD='\033[1m'
NC='\033[0m'

SPARK_NS="${SPARK_NS:-spark}"
UNITYCATALOG_NS="${UNITYCATALOG_NS:-unitycatalog}"
DUCKDB_SERVER_IMAGE="${DUCKDB_SERVER_IMAGE:-mizumi-duckdb-server:0.1.0}"
DUCKDB_SERVER_MANIFEST="${DUCKDB_SERVER_MANIFEST:-infra/k8s/duckdb/server.yaml}"

_SPR_PID=""

_start_spinner() {
  local msg="$1"
  (
    local sp='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while true; do
      printf "\r  ${CYN}%s${NC}  %s" "${sp:$((i % 10)):1}" "$msg"
      sleep 0.1
      i=$((i + 1))
    done
  ) &
  _SPR_PID=$!
}

_stop_spinner() {
  if [[ -n "$_SPR_PID" ]]; then
    kill "$_SPR_PID" 2>/dev/null || true
    wait "$_SPR_PID" 2>/dev/null || true
    _SPR_PID=""
  fi
  printf "\033[2K\r"
}

trap '_stop_spinner' EXIT INT TERM

ok() { printf "  ${GRN}✓${NC}  %s\n" "$1"; }
info() { printf "  ${CYN}→${NC}  %s\n" "$1"; }
err() { printf "  ${RED}✗${NC}  %s\n" "$1" >&2; }

q() {
  local desc="$1"
  shift
  local log
  log=$(mktemp /tmp/mizumi-duckdb-deploy.XXXXXX)
  _start_spinner "$desc"
  local rc=0
  "$@" >"$log" 2>&1 || rc=$?
  _stop_spinner
  if [[ $rc -eq 0 ]]; then
    ok "$desc"
  else
    err "$desc"
    cat "$log" >&2
    rm -f "$log"
    return $rc
  fi
  rm -f "$log"
}

q_pipe() {
  local desc="$1"
  shift
  local log
  log=$(mktemp /tmp/mizumi-duckdb-deploy.XXXXXX)
  _start_spinner "$desc"
  local rc=0
  bash -o pipefail -c "$*" >"$log" 2>&1 || rc=$?
  _stop_spinner
  if [[ $rc -eq 0 ]]; then
    ok "$desc"
  else
    err "$desc"
    cat "$log" >&2
    rm -f "$log"
    return $rc
  fi
  rm -f "$log"
}

v() {
  local desc="$1"
  shift
  info "$desc"
  "$@"
  ok "$desc"
}

upsert_unitycatalog_auth_secret() {
  local token_b64
  token_b64=$(kubectl get secret unitycatalog-auth \
    -n "$UNITYCATALOG_NS" \
    -o jsonpath='{.data.UC_INTERNAL_SERVICE_TOKEN}')

  if [[ -z "$token_b64" ]]; then
    echo "unitycatalog-auth in namespace ${UNITYCATALOG_NS} is missing UC_INTERNAL_SERVICE_TOKEN" >&2
    return 1
  fi

  kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: unitycatalog-auth
  namespace: ${SPARK_NS}
type: Opaque
data:
  UC_INTERNAL_SERVICE_TOKEN: ${token_b64}
EOF
}

printf "${BLU}${BLD}Mizumi DuckDB Quack server deploy${NC}\n"
printf "${YLW}Image:${NC} %s\n" "$DUCKDB_SERVER_IMAGE"
printf "${YLW}Namespace:${NC} %s\n" "$SPARK_NS"
printf "${YLW}Unity Catalog namespace:${NC} %s\n" "$UNITYCATALOG_NS"

q_pipe "Apply ${SPARK_NS} namespace" \
  "kubectl create namespace '$SPARK_NS' --dry-run=client -o yaml | kubectl apply -f -"

q "Copy Unity Catalog token secret into ${SPARK_NS}" upsert_unitycatalog_auth_secret

q "Build ${DUCKDB_SERVER_IMAGE}" docker build -t "$DUCKDB_SERVER_IMAGE" packages/duckdb-server
q "Apply DuckDB server manifest" kubectl apply -f "$DUCKDB_SERVER_MANIFEST"
v "Wait for DuckDB server rollout" \
  kubectl rollout status deployment/duckdb-server -n "$SPARK_NS" --timeout=120s

printf "\n${GRN}${BLD}DuckDB Quack server deployed.${NC}\n"
printf "Port-forward with: ${CYN}kubectl port-forward -n %s svc/duckdb-server-svc 8090:9494${NC}\n" "$SPARK_NS"
