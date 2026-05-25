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

#─── config (mirrored from Justfile) ───────────────────────────────────────────
CONTROLPLANE_NS=controlplane
CONTROLPLANE_MANIFESTS=infra/k8s/controlplane
CONTROLPLANE_IMAGE=mizumi-controlplane:0.1.0

WEBUI_NS=webui
WEBUI_MANIFESTS=infra/k8s/webui
WEBUI_IMAGE=mizumi-webui:0.1.0

UNITYCATALOG_NS=unitycatalog
UNITYCATALOG_IMAGE=mizumi-uc:0.1.0

DAGSTER_NS=dagster
DAGSTER_RELEASE=dagster
DAGSTER_CHART=dagster/dagster
DAGSTER_CHART_VERSION=1.13.4
DAGSTER_VALUES=infra/k8s/dagster/helm/values.yaml
DAGSTER_IMAGE=mizumi-dagster:1.13.4

SHARED_POSTGRES_NS=shared-postgres
SHARED_POSTGRES_MANIFESTS=infra/k8s/shared-postgres

RUSTFS_NS=rustfs
RUSTFS_RELEASE=rustfs
RUSTFS_CHART=rustfs/rustfs
RUSTFS_CHART_VERSION=0.1.0
RUSTFS_VALUES=infra/k8s/rustfs/helm/values.yaml
RUSTFS_ENDPOINT=http://host.docker.internal:9000
RUSTFS_ACCESS_KEY=rustfsadmin
RUSTFS_SECRET_KEY=rustfsadmin
RUSTFS_BAGGAGE_DIR=packages/synthetic/data/train

KEYCLOAK_NS=keycloak
KEYCLOAK_MANIFESTS=infra/k8s/keycloak
KEYCLOAK_IMAGE=mizumi-keycloak:26.3.3

SPARK_OPERATOR_NS=spark-operator
SPARK_NS=spark
SPARK_OPERATOR_RELEASE=spark-operator
SPARK_OPERATOR_CHART=spark-operator/spark-operator
SPARK_OPERATOR_CHART_VERSION=2.5.0
SPARK_OPERATOR_VALUES=infra/k8s/spark/helm/values.yaml
SPARK_IMAGE=mizumi-spark-rustfs:4.1.3

DUCKDB_IMAGE=mizumi-duckdb:1.1.6
DUCKDB_SERVER_IMAGE=mizumi-duckdb-server:0.1.0
DAFT_IMAGE=mizumi-daft:0.7.10
DAFT_BAGGAGE_CLASSIFIER_IMAGE=mizumi-daft-baggage-classifier:0.1.0


LANCEDB_NS=lancedb
LANCEDB_MANIFESTS=infra/k8s/lancedb
LANCEDB_IMAGE=mizumi-lancedb-server:0.1.0

SYNTHETIC_NS=synthetic
SYNTHETIC_MANIFESTS=infra/k8s/synthetic
SYNTHETIC_IMAGE=mizumi-synthetic-server:0.1.0

REDPANDA_NS=redpanda
REDPANDA_MANIFESTS=infra/k8s/redpanda
REDPANDA_TOPIC_JOB=redpanda-default-topic

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
TOTAL=20
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

# Run with spinner; output hidden and shown only on failure.
q() {
  local desc="$1"; shift
  local log; log=$(mktemp /tmp/mizumi-deploy.XXXXXX)
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

# Run with live output (rollout status, job logs).
v() {
  local desc="$1"; shift
  info "$desc"
  "$@"
  ok "$desc"
}

#─── reusable operations ───────────────────────────────────────────────────────

apply_openai_secret() {
  local namespace="$1"
  local secret_name="$2"
  kubectl create secret generic "${secret_name}" \
    -n "${namespace}" \
    --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY}" \
    --from-literal=OPENAI_BASE_URL="${OPENAI_BASE_URL}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_unitycatalog_auth_secrets() {
  kubectl create namespace "${UNITYCATALOG_NS}" 2>/dev/null || true
  kubectl create namespace "${CONTROLPLANE_NS}" 2>/dev/null || true
  kubectl create secret generic unitycatalog-auth \
    -n "${UNITYCATALOG_NS}" \
    --from-file=UC_INTERNAL_SERVER_KEY_PEM=packages/uc/config/server.key \
    --from-file=UC_INTERNAL_SERVICE_TOKEN=packages/uc/config/token.txt \
    --dry-run=client -o yaml | kubectl apply -f -
  kubectl create secret generic unitycatalog-auth \
    -n "${CONTROLPLANE_NS}" \
    --from-file=UC_INTERNAL_SERVICE_TOKEN=packages/uc/config/token.txt \
    --dry-run=client -o yaml | kubectl apply -f -
}

patch_coredns_for_s3_proxy() {
  local corefile
  corefile=$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}')
  if echo "$corefile" | grep -q 'rustfs-s3-proxy'; then
    return 0
  fi
  local patched
  patched=$(echo "$corefile" | awk '
    /^[ \t]*ready$/ {
      print
      print "    rewrite name exact s3.us-east-1.amazonaws.com rustfs-s3-proxy.rustfs.svc.cluster.local"
      print "    rewrite name exact unitycatalog.s3.us-east-1.amazonaws.com rustfs-s3-proxy.rustfs.svc.cluster.local"
      next
    }
    { print }
  ')
  kubectl patch configmap coredns -n kube-system \
    --patch "{\"data\":{\"Corefile\":$(printf '%s' "$patched" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}}"
  kubectl rollout restart deployment/coredns -n kube-system
  kubectl rollout status deployment/coredns -n kube-system --timeout=120s
}

baggage_upload() {
  if [[ ! -d "${RUSTFS_BAGGAGE_DIR}" ]]; then
    echo "missing directory: ${RUSTFS_BAGGAGE_DIR}" >&2
    return 1
  fi
  kubectl port-forward -n "${RUSTFS_NS}" svc/rustfs-svc --address 0.0.0.0 9000:9000 \
    >/tmp/mizumi-rustfs-pf.log 2>&1 &
  local pf_pid=$!
  sleep 3
  local rc=0
  docker run --rm \
    --entrypoint /bin/sh \
    -v "$PWD/${RUSTFS_BAGGAGE_DIR}:/upload:ro" \
    minio/mc:latest -ec "
      mc alias set rustfs ${RUSTFS_ENDPOINT} ${RUSTFS_ACCESS_KEY} ${RUSTFS_SECRET_KEY}
      mc mb --ignore-existing rustfs/unitycatalog
      mc mirror --overwrite /upload rustfs/unitycatalog/vietjetair/baggage_damaged_reports
    " || rc=$?
  kill "$pf_pid" 2>/dev/null || true
  wait "$pf_pid" 2>/dev/null || true
  return $rc
}

#═══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY CHECKS
#═══════════════════════════════════════════════════════════════════════════════

_missing=0
for _tool in brew docker helm kubectl; do
  if ! command -v "$_tool" &>/dev/null; then
    err "$_tool is not installed or not in PATH"
    _missing=1
  fi
done
if [[ $_missing -eq 1 ]]; then
  printf "\n  Install missing tools and re-run.\n" >&2
  exit 1
fi
ok "brew / docker / helm / kubectl found"

#═══════════════════════════════════════════════════════════════════════════════
# ENV CHECKS
#═══════════════════════════════════════════════════════════════════════════════

_DEFAULT_OPENAI_BASE_URL="https://api.openai.com/v1"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  printf "${YLW}⚠${NC}  OPENAI_API_KEY is not set.\n"
  printf "   Enter your OpenAI API key: "
  read -r OPENAI_API_KEY
  if [[ -z "$OPENAI_API_KEY" ]]; then
    err "OPENAI_API_KEY cannot be empty. Aborting."
    exit 1
  fi
  export OPENAI_API_KEY
fi

if [[ -z "${OPENAI_BASE_URL:-}" ]]; then
  printf "${YLW}⚠${NC}  OPENAI_BASE_URL is not set.\n"
  printf "   Enter base URL [${_DEFAULT_OPENAI_BASE_URL}]: "
  read -r OPENAI_BASE_URL
  OPENAI_BASE_URL="${OPENAI_BASE_URL:-${_DEFAULT_OPENAI_BASE_URL}}"
  export OPENAI_BASE_URL
fi

ok "OPENAI_API_KEY     set"
ok "OPENAI_BASE_URL    ${OPENAI_BASE_URL}"

#═══════════════════════════════════════════════════════════════════════════════
# DEPLOY
#═══════════════════════════════════════════════════════════════════════════════

printf "${BLD}Mizumi full-stack deploy${NC}  (${TOTAL} steps)\n"
printf "${YLW}Started: %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
DEPLOY_START=$SECONDS

#───────────────────────────────────────────────────────────────────────────────
step "Setup Metrics Server"
#───────────────────────────────────────────────────────────────────────────────
v "Setup metrics-server" ./scripts/setup-metrics-server.sh
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Pull base Docker images"
#───────────────────────────────────────────────────────────────────────────────
q "Pull curlimages/curl:8.13.0"                              docker pull curlimages/curl:8.13.0
q "Pull docker.io/busybox:1.28"                              docker pull docker.io/busybox:1.28
q "Pull docker.io/library/postgres:14.6"                     docker pull docker.io/library/postgres:14.6
q "Pull ghcr.io/kubeflow/spark-operator/controller:2.5.0"   docker pull ghcr.io/kubeflow/spark-operator/controller:2.5.0
q "Pull python:3.11-alpine"                                  docker pull python:3.11-alpine
q "Pull busybox:stable"                                      docker pull busybox:stable
q "Pull caddy:2.8-alpine"                                    docker pull caddy:2.8-alpine
q "Pull redpanda console v2.8.3"                             docker pull docker.redpanda.com/redpandadata/console:v2.8.3
q "Pull redpanda v24.3.11"                                   docker pull docker.redpanda.com/redpandadata/redpanda:v24.3.11
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Add Helm repos"
#───────────────────────────────────────────────────────────────────────────────
q "Add rustfs repo"          bash -c "helm repo add rustfs https://charts.rustfs.com/ 2>/dev/null || true && helm repo update rustfs"
q "Add dagster repo"         bash -c "helm repo add dagster https://dagster-io.github.io/helm 2>/dev/null || true && helm repo update dagster"
q "Add spark-operator repo"  bash -c "helm repo add spark-operator https://kubeflow.github.io/spark-operator 2>/dev/null || true && helm repo update spark-operator"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Deploy RustFS (object storage)"
#───────────────────────────────────────────────────────────────────────────────
q "Install RustFS chart" \
  helm upgrade --install "${RUSTFS_RELEASE}" "${RUSTFS_CHART}" \
    --namespace "${RUSTFS_NS}" \
    --create-namespace \
    --version "${RUSTFS_CHART_VERSION}" \
    --values "${RUSTFS_VALUES}"
v "Wait for RustFS rollout" \
  kubectl rollout status deployment/"${RUSTFS_RELEASE}" -n "${RUSTFS_NS}" --timeout=180s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Deploy RustFS S3 proxy + enable CoreDNS rewrites"
#───────────────────────────────────────────────────────────────────────────────
q "Create namespaces" bash -c "
  kubectl create namespace ${RUSTFS_NS} 2>/dev/null || true
  kubectl create namespace ${SPARK_NS}  2>/dev/null || true
"
q "Apply S3 proxy manifests" kubectl apply -f infra/k8s/rustfs/s3-proxy.yaml
v "Wait for S3 proxy rollout" \
  kubectl rollout status deployment/rustfs-s3-proxy -n "${RUSTFS_NS}" --timeout=120s
q "Patch CoreDNS + wait for rollout" patch_coredns_for_s3_proxy
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Download baggage dataset"
#───────────────────────────────────────────────────────────────────────────────
v "Download dataset" bash packages/synthetic/scripts/download-dataset.sh
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Upload baggage dataset to RustFS"
#───────────────────────────────────────────────────────────────────────────────
q "Mirror ${RUSTFS_BAGGAGE_DIR} → rustfs/unitycatalog/vietjetair/baggage_damaged_reports" \
  baggage_upload
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Deploy Redpanda (Kafka)"
#───────────────────────────────────────────────────────────────────────────────
q "Create namespace" kubectl create namespace "${REDPANDA_NS}" 2>/dev/null || true
q "Apply Redpanda manifests" kubectl apply -f "${REDPANDA_MANIFESTS}/"
v "Wait for Redpanda statefulset" \
  kubectl rollout status statefulset/redpanda -n "${REDPANDA_NS}" --timeout=180s
v "Wait for Redpanda console" \
  kubectl rollout status deployment/redpanda-console -n "${REDPANDA_NS}" --timeout=180s
q "Delete stale topic bootstrap job" \
  kubectl delete job "${REDPANDA_TOPIC_JOB}" -n "${REDPANDA_NS}" --ignore-not-found
q "Apply topic bootstrap job" \
  kubectl apply -f "${REDPANDA_MANIFESTS}/topic-job.yaml"
v "Wait for topic bootstrap" \
  kubectl wait --for=condition=complete job/"${REDPANDA_TOPIC_JOB}" -n "${REDPANDA_NS}" --timeout=120s
v "Topic bootstrap logs" \
  kubectl logs job/"${REDPANDA_TOPIC_JOB}" -n "${REDPANDA_NS}"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Deploy & bootstrap Shared Postgres"
#───────────────────────────────────────────────────────────────────────────────
q "Create namespace" kubectl create namespace "${SHARED_POSTGRES_NS}" 2>/dev/null || true
q "Apply Postgres manifests" kubectl apply -f "${SHARED_POSTGRES_MANIFESTS}/postgres.yaml"
v "Wait for Postgres statefulset" \
  kubectl rollout status statefulset/shared-postgres -n "${SHARED_POSTGRES_NS}" --timeout=300s
v "Bootstrap shared Postgres" ./scripts/bootstrap-shared-postgres.sh
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy Keycloak (IAM)"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${KEYCLOAK_IMAGE}" docker build -t "${KEYCLOAK_IMAGE}" packages/keycloak
q "Create namespace" kubectl create namespace "${KEYCLOAK_NS}" 2>/dev/null || true
q "Apply Keycloak Postgres alias" kubectl apply -f "${KEYCLOAK_MANIFESTS}/postgres.yaml"
q "Apply Keycloak deployment" kubectl apply -f "${KEYCLOAK_MANIFESTS}/keycloak.yaml"
v "Wait for Keycloak rollout" \
  kubectl rollout status deployment/keycloak -n "${KEYCLOAK_NS}" --timeout=300s
q "Delete stale bootstrap job" \
  kubectl delete job keycloak-bootstrap -n "${KEYCLOAK_NS}" --ignore-not-found
q "Apply bootstrap job" \
  kubectl apply -f "${KEYCLOAK_MANIFESTS}/bootstrap-job.yaml"
v "Wait for bootstrap job" \
  kubectl wait --for=condition=complete job/keycloak-bootstrap -n "${KEYCLOAK_NS}" --timeout=180s
v "Bootstrap logs" kubectl logs job/keycloak-bootstrap -n "${KEYCLOAK_NS}"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy Dagster (orchestrator)"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${DAGSTER_IMAGE}" docker build -t "${DAGSTER_IMAGE}" -f packages/dagster/Dockerfile .
q "Create namespace" kubectl create namespace "${DAGSTER_NS}" 2>/dev/null || true
q "Apply Postgres alias" kubectl apply -f infra/k8s/dagster/postgres-alias.yaml
q "Delete stale Postgres secret (first install)" bash -c "
  if ! helm status ${DAGSTER_RELEASE} -n ${DAGSTER_NS} >/dev/null 2>&1; then
    kubectl delete secret dagster-postgresql-secret -n ${DAGSTER_NS} --ignore-not-found
  fi
"
q "Install Dagster chart" \
  helm upgrade --install "${DAGSTER_RELEASE}" "${DAGSTER_CHART}" \
    --namespace "${DAGSTER_NS}" \
    --create-namespace \
    --version "${DAGSTER_CHART_VERSION}" \
    --values "${DAGSTER_VALUES}"
v "Wait for Dagster daemon" \
  kubectl rollout status deployment/"${DAGSTER_RELEASE}"-daemon -n "${DAGSTER_NS}" --timeout=300s
v "Wait for Dagster user deployments" \
  kubectl rollout status deployment/"${DAGSTER_RELEASE}"-dagster-user-deployments-mizumi -n "${DAGSTER_NS}" --timeout=300s
v "Wait for Dagster webserver" \
  kubectl rollout status deployment/"${DAGSTER_RELEASE}"-dagster-webserver -n "${DAGSTER_NS}" --timeout=600s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy Unity Catalog"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${UNITYCATALOG_IMAGE}" docker build -t "${UNITYCATALOG_IMAGE}" packages/uc
q "Create namespace" kubectl create namespace "${UNITYCATALOG_NS}" 2>/dev/null || true
q "Apply auth secrets (unitycatalog + controlplane namespaces)" apply_unitycatalog_auth_secrets
q "Apply Postgres alias" kubectl apply -f infra/k8s/unitycatalog/postgres.yaml
q "Apply Unity Catalog server" kubectl apply -f infra/k8s/unitycatalog/server.yaml
v "Wait for Unity Catalog" \
  kubectl wait --for=condition=Available deployment/unitycatalog -n "${UNITYCATALOG_NS}" --timeout=180s
q "Delete stale bootstrap job" \
  kubectl delete job unitycatalog-bootstrap -n "${UNITYCATALOG_NS}" --ignore-not-found
q "Apply bootstrap job" \
  kubectl apply -f infra/k8s/unitycatalog/bootstrap-job.yaml
v "Wait for bootstrap job" \
  kubectl wait --for=condition=complete job/unitycatalog-bootstrap -n "${UNITYCATALOG_NS}" --timeout=120s
v "Bootstrap logs" kubectl logs job/unitycatalog-bootstrap -n "${UNITYCATALOG_NS}"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Deploy Spark operator"
#───────────────────────────────────────────────────────────────────────────────
q "Create spark namespace" kubectl create namespace "${SPARK_NS}" 2>/dev/null || true
q "Install spark-operator chart" \
  helm upgrade --install "${SPARK_OPERATOR_RELEASE}" "${SPARK_OPERATOR_CHART}" \
    --namespace "${SPARK_OPERATOR_NS}" \
    --create-namespace \
    --version "${SPARK_OPERATOR_CHART_VERSION}" \
    --values "${SPARK_OPERATOR_VALUES}"
v "Wait for spark-operator deployments" \
  kubectl wait --namespace "${SPARK_OPERATOR_NS}" --for=condition=Available deployment --all --timeout=180s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build container images"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${SPARK_IMAGE}"                   docker build -t "${SPARK_IMAGE}" packages/spark
q "Build ${DAFT_IMAGE}"                    docker build -t "${DAFT_IMAGE}" -f packages/daft/Dockerfile .
q "Build ${DAFT_BAGGAGE_CLASSIFIER_IMAGE}" docker build -t "${DAFT_BAGGAGE_CLASSIFIER_IMAGE}" -f packages/daft/Dockerfile.baggage-classifier .
q "Build ${DUCKDB_IMAGE}"                  docker build -t "${DUCKDB_IMAGE}" -f packages/duckdb/Dockerfile .
q "Build ${DUCKDB_SERVER_IMAGE}"           docker build -t "${DUCKDB_SERVER_IMAGE}" packages/duckdb-server
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Enable RustFS anonymous read on unitycatalog bucket"
#───────────────────────────────────────────────────────────────────────────────
q "Delete stale job" \
  kubectl delete job rustfs-unitycatalog-anon-read -n "${RUSTFS_NS}" --ignore-not-found
q "Create anon-read job" \
  kubectl create job rustfs-unitycatalog-anon-read \
    -n "${RUSTFS_NS}" \
    --image=minio/mc:latest \
    -- /bin/sh -ec '
      mc alias set rustfs http://rustfs-svc.rustfs.svc.cluster.local:9000 rustfsadmin rustfsadmin
      mc mb --ignore-existing rustfs/unitycatalog
      mc anonymous set download rustfs/unitycatalog
    '
v "Wait for anon-read job" \
  kubectl wait --for=condition=complete job/rustfs-unitycatalog-anon-read -n "${RUSTFS_NS}" --timeout=120s
v "Anon-read logs" kubectl logs job/rustfs-unitycatalog-anon-read -n "${RUSTFS_NS}"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Deploy DuckDB server"
#───────────────────────────────────────────────────────────────────────────────
q "Apply DuckDB server manifests" kubectl apply -f infra/k8s/duckdb/server.yaml
v "Wait for DuckDB server rollout" \
  kubectl rollout status deployment/duckdb-server -n "${SPARK_NS}" --timeout=120s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy Controlplane"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${CONTROLPLANE_IMAGE}" \
  docker build -f packages/controlplane/Dockerfile -t "${CONTROLPLANE_IMAGE}" .
q "Create namespace" kubectl create namespace "${CONTROLPLANE_NS}" 2>/dev/null || true
q "Create controlplane-secret" apply_openai_secret "${CONTROLPLANE_NS}" controlplane-secret
q "Apply Postgres alias" kubectl apply -f "${CONTROLPLANE_MANIFESTS}/postgres.yaml"
q "Apply Controlplane deployment" kubectl apply -f "${CONTROLPLANE_MANIFESTS}/deployment.yaml"
v "Wait for Controlplane rollout" \
  kubectl rollout status deployment/controlplane -n "${CONTROLPLANE_NS}" --timeout=120s
q "Delete stale bootstrap job" \
  kubectl delete job controlplane-bootstrap -n "${CONTROLPLANE_NS}" --ignore-not-found
q "Apply bootstrap job" \
  kubectl apply -f "${CONTROLPLANE_MANIFESTS}/bootstrap-job.yaml"
v "Wait for bootstrap job" \
  kubectl wait --for=condition=complete job/controlplane-bootstrap -n "${CONTROLPLANE_NS}" --timeout=180s
v "Bootstrap logs" kubectl logs job/controlplane-bootstrap -n "${CONTROLPLANE_NS}"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy WebUI"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${WEBUI_IMAGE}" docker build -t "${WEBUI_IMAGE}" packages/webui
q "Create namespace" kubectl create namespace "${WEBUI_NS}" 2>/dev/null || true
q "Create webui-secret" apply_openai_secret "${WEBUI_NS}" webui-secret
q "Apply WebUI deployment" kubectl apply -f "${WEBUI_MANIFESTS}/deployment.yaml"
v "Wait for WebUI rollout" \
  kubectl rollout status deployment/webui -n "${WEBUI_NS}" --timeout=180s
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Build & deploy LanceDB + embed schema"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${LANCEDB_IMAGE}" docker build -t "${LANCEDB_IMAGE}" packages/lancedb-server
q "Create namespace" kubectl create namespace "${LANCEDB_NS}" 2>/dev/null || true
q "Create lancedb-secret" apply_openai_secret "${LANCEDB_NS}" lancedb-secret
q "Apply LanceDB server manifests" kubectl apply -f "${LANCEDB_MANIFESTS}/server.yaml"
v "Wait for LanceDB rollout" \
  kubectl rollout status deployment/lancedb-server -n "${LANCEDB_NS}" --timeout=120s
q "Delete stale embed-schema job" \
  kubectl delete job lancedb-embed-schema -n "${LANCEDB_NS}" --ignore-not-found
q "Apply embed-schema job" \
  kubectl apply -f "${LANCEDB_MANIFESTS}/embed-schema-job.yaml"
v "Wait for embed-schema job" \
  kubectl wait --for=condition=complete job/lancedb-embed-schema -n "${LANCEDB_NS}" --timeout=300s
v "Embed-schema logs" kubectl logs job/lancedb-embed-schema -n "${LANCEDB_NS}"
step_done

#───────────────────────────────────────────────────────────────────────────────
step "Bootstrap & deploy Synthetic server"
#───────────────────────────────────────────────────────────────────────────────
q "Build ${SYNTHETIC_IMAGE}" docker build -t "${SYNTHETIC_IMAGE}" packages/synthetic
q "Create namespace" kubectl create namespace "${SYNTHETIC_NS}" 2>/dev/null || true
q "Delete stale bootstrap job + configmap" bash -c "
  kubectl delete job synthetic-bootstrap -n ${SYNTHETIC_NS} --ignore-not-found
  kubectl delete configmap synthetic-bootstrap-config -n ${SYNTHETIC_NS} --ignore-not-found
"
q "Apply bootstrap job" kubectl apply -f "${SYNTHETIC_MANIFESTS}/bootstrap-job.yaml"
v "Wait for bootstrap job" \
  kubectl wait --for=condition=complete job/synthetic-bootstrap -n "${SYNTHETIC_NS}" --timeout=120s
v "Bootstrap generator logs" \
  kubectl logs job/synthetic-bootstrap -n "${SYNTHETIC_NS}" -c generator
v "Bootstrap logs" \
  kubectl logs job/synthetic-bootstrap -n "${SYNTHETIC_NS}" -c bootstrap
q "Apply Synthetic server manifests" kubectl apply -f "${SYNTHETIC_MANIFESTS}/server.yaml"
v "Wait for Synthetic server rollout" \
  kubectl rollout status deployment/synthetic-server -n "${SYNTHETIC_NS}" --timeout=120s
step_done

#───────────────────────────────────────────────────────────────────────────────
printf "\n${GRN}${BLD}════════════════════════════════════════${NC}\n"
printf "${GRN}${BLD}  Deploy complete in %ds${NC}\n" "$((SECONDS - DEPLOY_START))"
printf "${GRN}${BLD}════════════════════════════════════════${NC}\n\n"
printf "  Controlplane API  http://127.0.0.1:4000   (just forward)\n"
printf "  WebUI             http://127.0.0.1:3000\n"
printf "  Dagster UI        http://127.0.0.1:8088\n"
printf "  RustFS console    http://127.0.0.1:9001\n"
printf "  Keycloak          http://127.0.0.1:8080\n"
printf "  Unity Catalog     http://127.0.0.1:8082\n"
printf "  LanceDB           http://127.0.0.1:8091\n"
printf "  Synthetic API     http://127.0.0.1:8092\n"
printf "  Redpanda UI       http://127.0.0.1:8081\n\n"
