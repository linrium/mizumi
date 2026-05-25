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
RUSTFS_NS=rustfs

MLFLOW_IMAGE=mizumi-mlflow:0.1.0
BAGGAGE_DAMAGE_TRAINER_IMAGE=mizumi-daft-baggage-damage-trainer:0.1.0
BAGGAGE_MODEL_SERVER_IMAGE=mizumi-baggage-model-server:0.1.0

KUBERAY_VERSION=1.3.0
KUBERAY_NS=kuberay-system

RUSTFS_ENDPOINT=http://host.docker.internal:9000
RUSTFS_ACCESS_KEY=rustfsadmin
RUSTFS_SECRET_KEY=rustfsadmin

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
for _tool in brew docker kubectl helm; do
  if ! command -v "$_tool" &>/dev/null; then
    err "$_tool is not installed or not in PATH"
    _missing=1
  fi
done
if [[ $_missing -eq 1 ]]; then
  printf "\n  Install missing tools and re-run.\n" >&2
  exit 1
fi
ok "brew / docker / kubectl / helm found"

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
q "Delete stale bucket-create job" \
  kubectl delete job mlflow-artifact-bucket-create -n "${RUSTFS_NS}" --ignore-not-found
q "Create mlflow artifact bucket" \
  kubectl create job mlflow-artifact-bucket-create -n "${RUSTFS_NS}" \
    --image=minio/mc:latest -- /bin/sh -ec \
    'mc alias set rustfs http://rustfs-svc.rustfs.svc.cluster.local:9000 rustfsadmin rustfsadmin && mc mb --ignore-existing rustfs/mlflow'
q "Wait for bucket-create job" \
  kubectl wait --for=condition=complete job/mlflow-artifact-bucket-create \
    -n "${RUSTFS_NS}" --timeout=120s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Train baggage damage model"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${BAGGAGE_DAMAGE_TRAINER_IMAGE}" \
  docker build -t "${BAGGAGE_DAMAGE_TRAINER_IMAGE}" -f packages/daft/Dockerfile.baggage-damage-trainer .
kubectl port-forward --address 0.0.0.0 -n "${RUSTFS_NS}" svc/rustfs-svc 9000:9000 \
  >/tmp/rustfs-train-local.port-forward.log 2>&1 &
_RUSTFS_PF_PID=$!
kubectl port-forward --address 0.0.0.0 -n "${ML_NS}" svc/mlflow-svc 5000:5000 \
  >/tmp/mlflow-train-local.port-forward.log 2>&1 &
_MLFLOW_PF_PID=$!
_cleanup_pf() {
  kill "$_RUSTFS_PF_PID" "$_MLFLOW_PF_PID" 2>/dev/null || true
  wait "$_RUSTFS_PF_PID" "$_MLFLOW_PF_PID" 2>/dev/null || true
}
trap '_stop_spinner; _cleanup_pf' EXIT INT TERM
sleep 3
q "Ensure mlflow bucket exists" \
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    --entrypoint /bin/sh \
    minio/mc:latest -ec \
    "mc alias set rustfs ${RUSTFS_ENDPOINT} ${RUSTFS_ACCESS_KEY} ${RUSTFS_SECRET_KEY} && mc mb --ignore-existing rustfs/mlflow"
v "Train baggage damage model" \
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    -e GIT_PYTHON_REFRESH=quiet \
    -e RUSTFS_ENDPOINT_URL="${RUSTFS_ENDPOINT}" \
    -e AWS_ACCESS_KEY_ID="${RUSTFS_ACCESS_KEY}" \
    -e AWS_SECRET_ACCESS_KEY="${RUSTFS_SECRET_KEY}" \
    -e MLFLOW_TRACKING_URI=http://host.docker.internal:5000 \
    -e MLFLOW_EXPERIMENT_NAME=vietjetair-baggage-damage \
    -e MLFLOW_S3_ENDPOINT_URL="${RUSTFS_ENDPOINT}" \
    -e AWS_DEFAULT_REGION=us-east-1 \
    -e SOURCE_BUCKET=unitycatalog \
    -e GOLD_TABLE_PATH=s3://unitycatalog/vietjetair/vietjetair_partnership_prod_gold/baggage_damage_classifications_v1 \
    -e MLFLOW_MODEL_NAME=baggage-damage-detector \
    "${BAGGAGE_DAMAGE_TRAINER_IMAGE}"
_cleanup_pf
trap '_stop_spinner' EXIT INT TERM
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy Baggage Model Server (Ray Serve)"
#───────────────────────────────────────────────────────────────────────────────

# Install / upgrade KubeRay operator
q "Add KubeRay Helm repo" \
  helm repo add kuberay https://ray-project.github.io/kuberay-helm/
q "Update Helm repos" \
  helm repo update
q "Install/upgrade KubeRay operator v${KUBERAY_VERSION}" \
  helm upgrade --install kuberay-operator kuberay/kuberay-operator \
    --namespace "${KUBERAY_NS}" \
    --create-namespace \
    --version "${KUBERAY_VERSION}" \
    --wait --timeout 120s

# Build image (now includes ray[serve] and serve_app.py)
q "Build ${BAGGAGE_MODEL_SERVER_IMAGE}" \
  docker build -t "${BAGGAGE_MODEL_SERVER_IMAGE}" packages/baggage-model-server

# Apply RayService manifest (RayCluster head-only + stable alias Service)
q "Apply Ray Serve manifests" \
  kubectl apply -f "${ML_MANIFESTS}/ray-baggage-serve.yaml"

# Wait for the RayService head pod to become Ready.
# The pod is scheduled by the KubeRay operator after the RayCluster is created,
# so we first poll until at least one pod appears before handing off to kubectl wait.
info "Waiting for Ray head pod to appear…"
_deadline=$(( SECONDS + 120 ))
until kubectl get pod -n "${ML_NS}" \
    -l "app=baggage-model-serve,ray.io/node-type=head" \
    --no-headers 2>/dev/null | grep -q .; do
  if [[ $SECONDS -ge $_deadline ]]; then
    err "Timed out waiting for Ray head pod to be scheduled"
    exit 1
  fi
  sleep 3
done
ok "Ray head pod scheduled"

# Model load (CLIP + MLflow artifacts) can take several minutes on first start.
info "Waiting for Ray head pod to be Ready (model load may take a few minutes)…"
kubectl wait pod \
  -n "${ML_NS}" \
  -l "app=baggage-model-serve,ray.io/node-type=head" \
  --for=condition=Ready \
  --timeout=600s
ok "Ray head pod is Ready"

step_done

#───────────────────────────────────────────────────────────────────────────────
printf "\n${GRN}${BLD}════════════════════════════════════════${NC}\n"
printf "${GRN}${BLD}  ML deploy complete in %ds${NC}\n" "$((SECONDS - DEPLOY_START))"
printf "${GRN}${BLD}════════════════════════════════════════${NC}\n\n"
printf "  MLflow UI        http://127.0.0.1:5000\n"
printf "  Ray Dashboard    http://127.0.0.1:8265  (kubectl port-forward -n ml svc/baggage-model-serve-head-svc 8265:8265)\n"
printf "  Baggage Serve    http://127.0.0.1:8000  (kubectl port-forward -n ml svc/baggage-model-serve-serve-svc 8000:8000)\n\n"
