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
ML_NS=ml
RUSTFS_NS=rustfs
KUBERAY_NS=kuberay-system

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
TOTAL=3
STEP=0
_STEP_START=0

step() {
  STEP=$((STEP + 1))
  _STEP_START=$SECONDS
  printf "\n${BLU}${BLD}[%02d/%02d]${NC}${BLD} %s${NC}\n" "$STEP" "$TOTAL" "$1"
}

step_done() {
  printf "  ${GRN}✓${NC} completed in %ds\n" "$((SECONDS - _STEP_START))"
}

ok()   { printf "  ${GRN}✓${NC}  %s\n" "$1"; }
info() { printf "  ${CYN}→${NC}  %s\n" "$1"; }
warn() { printf "  ${YLW}⚠${NC}  %s\n" "$1"; }
err()  { printf "  ${RED}✗${NC}  %s\n" "$1" >&2; }

q() {
  local desc="$1"; shift
  local log; log=$(mktemp /tmp/mizumi-destroy-ml.XXXXXX)
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

#═══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY CHECKS
#═══════════════════════════════════════════════════════════════════════════════

_missing=0
for _tool in kubectl helm; do
  if ! command -v "$_tool" &>/dev/null; then
    err "$_tool is not installed or not in PATH"
    _missing=1
  fi
done
if [[ $_missing -eq 1 ]]; then
  printf "\n  Install missing tools and re-run.\n" >&2
  exit 1
fi
ok "kubectl / helm found"

#═══════════════════════════════════════════════════════════════════════════════
# DESTROY
#═══════════════════════════════════════════════════════════════════════════════

printf "${BLD}Mizumi ML stack destroy${NC}  (${TOTAL} steps)\n"
printf "${YLW}Started: %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
DESTROY_START=$SECONDS

warn "This will permanently remove all ML services and their K8s resources."
warn "MLflow artifacts in RustFS (s3://mlflow) are NOT deleted by this script."

#───────────────────────────────────────────────────────────────────────────────
step "Remove Baggage Model Server (Ray Serve)"
#───────────────────────────────────────────────────────────────────────────────

# Delete the RayService first so the KubeRay operator can gracefully tear down
# the RayCluster and its pods before the operator itself is removed.
q "Delete RayService baggage-model-serve" \
  kubectl delete rayservice baggage-model-serve -n "${ML_NS}" --ignore-not-found
q "Delete baggage-model-svc alias Service" \
  kubectl delete service baggage-model-svc -n "${ML_NS}" --ignore-not-found

# Wait for Ray cluster pods to be fully gone before removing the operator.
info "Waiting for Ray pods to terminate…"
kubectl wait pod \
  -n "${ML_NS}" \
  -l "app=baggage-model-serve" \
  --for=delete \
  --timeout=120s 2>/dev/null || true
ok "Ray pods terminated"

step_done

#───────────────────────────────────────────────────────────────────────────────
step "Remove KubeRay operator"
#───────────────────────────────────────────────────────────────────────────────

q "Uninstall kuberay-operator Helm release" \
  helm uninstall kuberay-operator --namespace "${KUBERAY_NS}" --ignore-not-found
q "Delete ${KUBERAY_NS} namespace" \
  kubectl delete namespace "${KUBERAY_NS}" --ignore-not-found --wait=false

step_done

#───────────────────────────────────────────────────────────────────────────────
step "Remove MLflow + ml namespace"
#───────────────────────────────────────────────────────────────────────────────

q "Delete mlflow-artifact-bucket-create job" \
  kubectl delete job mlflow-artifact-bucket-create -n "${RUSTFS_NS}" --ignore-not-found
q "Delete ${ML_NS} namespace (removes MLflow deployment, secrets, services)" \
  kubectl delete namespace "${ML_NS}" --ignore-not-found --wait=false

# Poll until the namespace is fully gone (finalizers on RayService CRDs can slow this).
info "Waiting for ${ML_NS} namespace to be removed…"
_deadline=$(( SECONDS + 180 ))
while kubectl get namespace "${ML_NS}" &>/dev/null; do
  if [[ $SECONDS -ge $_deadline ]]; then
    warn "Namespace ${ML_NS} is taking long to terminate — check for stuck finalizers:"
    warn "  kubectl get namespace ${ML_NS} -o jsonpath='{.metadata.finalizers}'"
    break
  fi
  sleep 3
done
ok "${ML_NS} namespace removed"

step_done

#───────────────────────────────────────────────────────────────────────────────
printf "\n${GRN}${BLD}════════════════════════════════════════${NC}\n"
printf "${GRN}${BLD}  ML destroy complete in %ds${NC}\n" "$((SECONDS - DESTROY_START))"
printf "${GRN}${BLD}════════════════════════════════════════${NC}\n\n"
printf "  ${YLW}Note:${NC} MLflow artifacts remain in RustFS at s3://mlflow/\n"
printf "        To purge them: kubectl exec -n rustfs deploy/rustfs -- mc rm --recursive --force rustfs/mlflow\n\n"
