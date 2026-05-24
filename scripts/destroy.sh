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

#─── config ────────────────────────────────────────────────────────────────────
CONTROLPLANE_NS=controlplane
CONTROLPLANE_MANIFESTS=infra/k8s/controlplane
WEBUI_NS=webui
WEBUI_MANIFESTS=infra/k8s/webui
UNITYCATALOG_NS=unitycatalog
DAGSTER_NS=dagster
DAGSTER_RELEASE=dagster
SHARED_POSTGRES_NS=shared-postgres
SHARED_POSTGRES_MANIFESTS=infra/k8s/shared-postgres
RUSTFS_NS=rustfs
RUSTFS_RELEASE=rustfs
KEYCLOAK_NS=keycloak
KEYCLOAK_MANIFESTS=infra/k8s/keycloak
SPARK_OPERATOR_NS=spark-operator
SPARK_NS=spark
SPARK_OPERATOR_RELEASE=spark-operator
LANCEDB_NS=lancedb
LANCEDB_MANIFESTS=infra/k8s/lancedb
SYNTHETIC_NS=synthetic
SYNTHETIC_MANIFESTS=infra/k8s/synthetic
REDPANDA_NS=redpanda
REDPANDA_MANIFESTS=infra/k8s/redpanda

#─── spinner ───────────────────────────────────────────────────────────────────
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

#─── step helpers ──────────────────────────────────────────────────────────────
TOTAL=13
STEP=0
_STEP_START=0

step() {
  STEP=$((STEP + 1))
  _STEP_START=$SECONDS
  printf "\n${RED}${BLD}[%02d/%02d]${NC}${BLD} %s${NC}\n" "$STEP" "$TOTAL" "$1"
}

step_done() {
  printf "  ${GRN}✓${NC} done in %ds\n" "$((SECONDS - _STEP_START))"
}

ok()   { printf "  ${GRN}✓${NC}  %s\n" "$1"; }
info() { printf "  ${CYN}→${NC}  %s\n" "$1"; }
warn() { printf "  ${YLW}⚠${NC}  %s\n" "$1"; }

q() {
  local desc="$1"; shift
  local log; log=$(mktemp /tmp/mizumi-destroy.XXXXXX)
  _start_spinner "$desc"
  local rc=0
  "$@" >"$log" 2>&1 || rc=$?
  _stop_spinner
  if [[ $rc -eq 0 ]]; then
    ok "$desc"
  else
    printf "  ${RED}✗${NC}  %s\n" "$desc"
    cat "$log" >&2
    rm -f "$log"
    return $rc
  fi
  rm -f "$log"
}

v() {
  local desc="$1"; shift
  info "$desc"
  "$@"
  ok "$desc"
}

#─── reusable operations ───────────────────────────────────────────────────────

unpatch_coredns_s3_proxy() {
  local corefile
  corefile=$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}' 2>/dev/null) || return 0
  if ! echo "$corefile" | grep -q 'rustfs-s3-proxy'; then
    return 0
  fi
  local patched
  patched=$(echo "$corefile" | grep -v 'rustfs-s3-proxy')
  kubectl patch configmap coredns -n kube-system \
    --patch "{\"data\":{\"Corefile\":$(printf '%s' "$patched" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}}"
  kubectl rollout restart deployment/coredns -n kube-system
  kubectl rollout status deployment/coredns -n kube-system --timeout=120s
}

#═══════════════════════════════════════════════════════════════════════════════
# DESTROY
#═══════════════════════════════════════════════════════════════════════════════

printf "${RED}${BLD}Mizumi full-stack destroy${NC}  (13 steps)\n"
printf "${YLW}⚠  This will delete all namespaces and data. Ctrl-C to abort.${NC}\n"
printf "${YLW}Started: %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"

# Give the user 5 seconds to abort
for i in 5 4 3 2 1; do
  printf "\r  Proceeding in ${RED}%d${NC}s ...  " "$i"
  sleep 1
done
printf "\r%-50s\r" " "

DESTROY_START=$SECONDS

#───────────────────────────────────────────────────────────────────────────────
step "Destroy WebUI"
#───────────────────────────────────────────────────────────────────────────────
q "Delete WebUI manifests"  kubectl delete -f "${WEBUI_MANIFESTS}/" --ignore-not-found
q "Delete webui namespace"  kubectl delete namespace "${WEBUI_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Controlplane"
#───────────────────────────────────────────────────────────────────────────────
q "Delete Controlplane manifests"  kubectl delete -f "${CONTROLPLANE_MANIFESTS}/" --ignore-not-found
q "Delete controlplane namespace"  kubectl delete namespace "${CONTROLPLANE_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy LanceDB"
#───────────────────────────────────────────────────────────────────────────────
q "Delete LanceDB manifests"  kubectl delete -f "${LANCEDB_MANIFESTS}/" --ignore-not-found
q "Delete lancedb namespace"  kubectl delete namespace "${LANCEDB_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Synthetic server"
#───────────────────────────────────────────────────────────────────────────────
q "Delete Synthetic manifests"  kubectl delete -f "${SYNTHETIC_MANIFESTS}/" --ignore-not-found
q "Delete synthetic namespace"  kubectl delete namespace "${SYNTHETIC_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy DuckDB server"
#───────────────────────────────────────────────────────────────────────────────
q "Delete DuckDB server manifests"  kubectl delete -f infra/k8s/duckdb/server.yaml --ignore-not-found
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Spark operator"
#───────────────────────────────────────────────────────────────────────────────
q "Uninstall spark-operator chart"    helm uninstall "${SPARK_OPERATOR_RELEASE}" --namespace "${SPARK_OPERATOR_NS}" 2>/dev/null || true
q "Delete spark namespace"            kubectl delete namespace "${SPARK_NS}" --ignore-not-found --wait=false
q "Delete spark-operator namespace"   kubectl delete namespace "${SPARK_OPERATOR_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Dagster"
#───────────────────────────────────────────────────────────────────────────────
q "Uninstall dagster chart"       helm uninstall "${DAGSTER_RELEASE}" --namespace "${DAGSTER_NS}" 2>/dev/null || true
q "Delete Postgres alias"         kubectl delete -f infra/k8s/dagster/postgres-alias.yaml --ignore-not-found
q "Delete dagster namespace"      kubectl delete namespace "${DAGSTER_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Unity Catalog"
#───────────────────────────────────────────────────────────────────────────────
q "Delete Unity Catalog manifests"   kubectl delete -f infra/k8s/unitycatalog/ --ignore-not-found
q "Delete unitycatalog namespace"    kubectl delete namespace "${UNITYCATALOG_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Keycloak"
#───────────────────────────────────────────────────────────────────────────────
q "Delete Keycloak manifests"   kubectl delete -f "${KEYCLOAK_MANIFESTS}/" --ignore-not-found
q "Delete keycloak namespace"   kubectl delete namespace "${KEYCLOAK_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Shared Postgres"
#───────────────────────────────────────────────────────────────────────────────
q "Delete Shared Postgres manifests"   kubectl delete -f "${SHARED_POSTGRES_MANIFESTS}/" --ignore-not-found
q "Delete shared-postgres namespace"   kubectl delete namespace "${SHARED_POSTGRES_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy Redpanda"
#───────────────────────────────────────────────────────────────────────────────
q "Delete Redpanda manifests"   kubectl delete -f "${REDPANDA_MANIFESTS}/" --ignore-not-found
q "Delete redpanda namespace"   kubectl delete namespace "${REDPANDA_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Remove CoreDNS S3 proxy rewrites + destroy S3 proxy"
#───────────────────────────────────────────────────────────────────────────────
q "Remove CoreDNS rewrite rules + wait for rollout" unpatch_coredns_s3_proxy
q "Delete S3 proxy manifests" kubectl delete -f infra/k8s/rustfs/s3-proxy.yaml --ignore-not-found
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Destroy RustFS"
#───────────────────────────────────────────────────────────────────────────────
q "Uninstall rustfs chart"    helm uninstall "${RUSTFS_RELEASE}" --namespace "${RUSTFS_NS}" 2>/dev/null || true
q "Delete rustfs namespace"   kubectl delete namespace "${RUSTFS_NS}" --ignore-not-found --wait=false
step_done

#───────────────────────────────────────────────────────────────────────────────
printf "\n${GRN}${BLD}════════════════════════════════════════${NC}\n"
printf "${GRN}${BLD}  Destroy complete in %ds${NC}\n" "$((SECONDS - DESTROY_START))"
printf "${GRN}${BLD}════════════════════════════════════════${NC}\n\n"
warn "Namespace deletions were issued with --wait=false."
warn "Run 'kubectl get namespaces' to confirm they have fully terminated."
printf "\n"
