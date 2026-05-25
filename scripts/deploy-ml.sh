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
ML_MANIFESTS=infra/k8s/ml

MLFLOW_IMAGE=mizumi-mlflow:0.1.0
BAGGAGE_MODEL_SERVER_IMAGE=mizumi-baggage-model-server:0.1.0

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
TOTAL=2
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
  local log; log=$(mktemp /tmp/mizumi-deploy-ml.XXXXXX)
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

v() {
  local desc="$1"; shift
  info "$desc"
  "$@"
  ok "$desc"
}

#═══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY CHECKS
#═══════════════════════════════════════════════════════════════════════════════

_missing=0
for _tool in brew docker kubectl; do
  if ! command -v "$_tool" &>/dev/null; then
    err "$_tool is not installed or not in PATH"
    _missing=1
  fi
done
if [[ $_missing -eq 1 ]]; then
  printf "\n  Install missing tools and re-run.\n" >&2
  exit 1
fi
ok "brew / docker / kubectl found"

#═══════════════════════════════════════════════════════════════════════════════
# DEPLOY
#═══════════════════════════════════════════════════════════════════════════════

printf "${BLD}Mizumi ML stack deploy${NC}  (${TOTAL} steps)\n"
printf "${YLW}Started: %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
DEPLOY_START=$SECONDS

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy MLflow"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${MLFLOW_IMAGE}"        docker build -t "${MLFLOW_IMAGE}" packages/mlflow
q "Apply MLflow manifests"       kubectl apply -f "${ML_MANIFESTS}/mlflow.yaml"
v "Wait for MLflow rollout" \
  kubectl rollout status deployment/mlflow -n "${ML_NS}" --timeout=180s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy Baggage Model Server"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${BAGGAGE_MODEL_SERVER_IMAGE}" \
  docker build -t "${BAGGAGE_MODEL_SERVER_IMAGE}" packages/baggage-model-server
q "Apply Baggage Model Server manifests" \
  kubectl apply -f "${ML_MANIFESTS}/baggage-model-server.yaml"
v "Wait for Baggage Model Server rollout" \
  kubectl rollout status deployment/baggage-model-server -n "${ML_NS}" --timeout=180s
step_done

#───────────────────────────────────────────────────────────────────────────────
printf "\n${GRN}${BLD}════════════════════════════════════════${NC}\n"
printf "${GRN}${BLD}  ML deploy complete in %ds${NC}\n" "$((SECONDS - DEPLOY_START))"
printf "${GRN}${BLD}════════════════════════════════════════${NC}\n\n"
printf "  MLflow UI        http://127.0.0.1:5000\n"
printf "  Baggage Model    http://127.0.0.1:8093\n\n"
