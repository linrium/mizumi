#!/usr/bin/env bash
set -euo pipefail

DAGSTER_NS="${DAGSTER_NS:-dagster}"
DAGSTER_RELEASE="${DAGSTER_RELEASE:-dagster}"
DAGSTER_CHART="${DAGSTER_CHART:-dagster/dagster}"
DAGSTER_CHART_VERSION="${DAGSTER_CHART_VERSION:-1.13.4}"
DAGSTER_VALUES="${DAGSTER_VALUES:-infra/k8s/dagster/helm/values.yaml}"
DAGSTER_IMAGE="${DAGSTER_IMAGE:-mizumi-dagster:1.13.4}"
DAGSTER_POSTGRES_ALIAS="${DAGSTER_POSTGRES_ALIAS:-infra/k8s/dagster/postgres-alias.yaml}"

SIGNOZ_INSTRUMENTATION_NS="${SIGNOZ_INSTRUMENTATION_NS:-signoz-infra}"
SIGNOZ_INSTRUMENTATION_NAME="${SIGNOZ_INSTRUMENTATION_NAME:-signoz-instrumentation}"

WAIT_TIMEOUT="${WAIT_TIMEOUT:-300s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"

BUILD_IMAGE=true
UPDATE_REPOS=true
CHECK_SIGNOZ=true
RESTART_DEPLOYMENTS=true

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Redeploy Dagster services from the local Helm values.

This rebuilds the Dagster image, reapplies the Dagster Helm release, restarts
the Dagster daemon, webserver, and user-code deployment, and waits for rollout.

Options:
  --skip-build             Reuse the existing ${DAGSTER_IMAGE} image
  --skip-repo-update       Do not add/update the Dagster Helm repo
  --skip-signoz-check      Do not check for the SigNoz Instrumentation resource
  --skip-rollout-restart   Do not force-restart deployments after Helm upgrade
  -h, --help               Show this help

Environment:
  DAGSTER_IMAGE            Dagster image tag (default: mizumi-dagster:1.13.4)
  DAGSTER_NS               Dagster namespace (default: dagster)
  DAGSTER_RELEASE          Helm release name (default: dagster)
  DAGSTER_CHART_VERSION    Dagster chart version (default: 1.13.4)
  DAGSTER_VALUES           Helm values file (default: infra/k8s/dagster/helm/values.yaml)
  WAIT_TIMEOUT             Rollout wait timeout (default: 300s)
  EXPECTED_CONTEXT         Refuse to run unless this kubectl context is active
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      BUILD_IMAGE=false
      shift
      ;;
    --skip-repo-update)
      UPDATE_REPOS=false
      shift
      ;;
    --skip-signoz-check)
      CHECK_SIGNOZ=false
      shift
      ;;
    --skip-rollout-restart)
      RESTART_DEPLOYMENTS=false
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

log() {
  printf '[dagster] %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "required command not found: $1" >&2
    exit 1
  }
}

check_context() {
  local current_context
  current_context="$(kubectl config current-context)"

  if [[ -n "${EXPECTED_CONTEXT}" && "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
    echo "current kubectl context is '${current_context}', expected '${EXPECTED_CONTEXT}'" >&2
    exit 1
  fi

  log "using kubectl context: ${current_context}"
}

wait_for_deployment() {
  local deployment="$1"
  log "waiting for ${deployment}"
  kubectl rollout status "deployment/${deployment}" \
    --namespace "${DAGSTER_NS}" \
    --timeout="${WAIT_TIMEOUT}"
}

require_command kubectl
require_command helm
require_command docker

[[ -f "${DAGSTER_VALUES}" ]] || {
  echo "Dagster values file not found: ${DAGSTER_VALUES}" >&2
  exit 1
}

check_context

if [[ "${CHECK_SIGNOZ}" == "true" ]]; then
  log "checking SigNoz Instrumentation resource"
  kubectl get instrumentation "${SIGNOZ_INSTRUMENTATION_NAME}" \
    --namespace "${SIGNOZ_INSTRUMENTATION_NS}" >/dev/null
fi

if [[ "${UPDATE_REPOS}" == "true" ]]; then
  log "adding/updating Dagster Helm repo"
  helm repo add dagster https://dagster-io.github.io/helm >/dev/null 2>&1 || true
  helm repo update dagster
else
  log "skipping Helm repo update"
fi

if [[ "${BUILD_IMAGE}" == "true" ]]; then
  log "building ${DAGSTER_IMAGE}"
  docker build -t "${DAGSTER_IMAGE}" -f packages/dagster/Dockerfile .
else
  log "skipping Dagster image build"
fi

log "ensuring Dagster namespace and Postgres alias"
kubectl create namespace "${DAGSTER_NS}" >/dev/null 2>&1 || true
kubectl apply -f "${DAGSTER_POSTGRES_ALIAS}"

log "installing/upgrading Dagster Helm release"
helm upgrade --install "${DAGSTER_RELEASE}" "${DAGSTER_CHART}" \
  --namespace "${DAGSTER_NS}" \
  --create-namespace \
  --version "${DAGSTER_CHART_VERSION}" \
  --values "${DAGSTER_VALUES}"

if [[ "${RESTART_DEPLOYMENTS}" == "true" ]]; then
  log "restarting Dagster deployments"
  kubectl rollout restart "deployment/${DAGSTER_RELEASE}-daemon" \
    --namespace "${DAGSTER_NS}"
  kubectl rollout restart "deployment/${DAGSTER_RELEASE}-dagster-user-deployments-mizumi" \
    --namespace "${DAGSTER_NS}"
  kubectl rollout restart "deployment/${DAGSTER_RELEASE}-dagster-webserver" \
    --namespace "${DAGSTER_NS}"
else
  log "skipping rollout restart"
fi

wait_for_deployment "${DAGSTER_RELEASE}-daemon"
wait_for_deployment "${DAGSTER_RELEASE}-dagster-user-deployments-mizumi"
wait_for_deployment "${DAGSTER_RELEASE}-dagster-webserver"

log "redeploy complete"
