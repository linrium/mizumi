#!/usr/bin/env bash
set -euo pipefail

KEYCLOAK_NS="${KEYCLOAK_NS:-keycloak}"
KEYCLOAK_MANIFESTS="${KEYCLOAK_MANIFESTS:-infra/k8s/keycloak}"
KEYCLOAK_IMAGE="${KEYCLOAK_IMAGE:-mizumi-keycloak:26.3.3}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-300s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"
KIND_CLUSTER="${KIND_CLUSTER:-}"

BUILD=true
BOOTSTRAP=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--skip-build] [--bootstrap]

Redeploy only the Keycloak service.

Options:
  --skip-build   Reuse the existing local image tag
  --bootstrap    Re-run infra/k8s/keycloak/bootstrap-job.yaml after rollout
  -h, --help     Show help

Environment:
  KEYCLOAK_IMAGE      Image tag to build (default: mizumi-keycloak:26.3.3)
  KEYCLOAK_NS         Kubernetes namespace (default: keycloak)
  KEYCLOAK_MANIFESTS  Manifest directory (default: infra/k8s/keycloak)
  WAIT_TIMEOUT        Rollout/bootstrap wait timeout (default: 300s)
  EXPECTED_CONTEXT    Refuse to run unless this kubectl context is active
  KIND_CLUSTER        If set, run: kind load docker-image --name "\$KIND_CLUSTER"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      BUILD=false
      shift
      ;;
    --bootstrap)
      BOOTSTRAP=true
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
  printf '[keycloak] %s\n' "$*"
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

require_command kubectl
require_command docker
check_context

if [[ "${BUILD}" == "true" ]]; then
  log "building ${KEYCLOAK_IMAGE}"
  docker build -t "${KEYCLOAK_IMAGE}" packages/keycloak

  if [[ -n "${KIND_CLUSTER}" ]]; then
    require_command kind
    log "loading ${KEYCLOAK_IMAGE} into kind cluster ${KIND_CLUSTER}"
    kind load docker-image "${KEYCLOAK_IMAGE}" --name "${KIND_CLUSTER}"
  fi
else
  log "skipping image build"
fi

log "ensuring namespace"
kubectl create namespace "${KEYCLOAK_NS}" 2>/dev/null || true

log "applying Keycloak Postgres alias"
kubectl apply -f "${KEYCLOAK_MANIFESTS}/postgres.yaml"

log "applying Keycloak deployment"
kubectl apply -f "${KEYCLOAK_MANIFESTS}/keycloak.yaml"

log "restarting Keycloak deployment"
kubectl rollout restart deployment/keycloak -n "${KEYCLOAK_NS}"

log "waiting for rollout"
kubectl rollout status deployment/keycloak -n "${KEYCLOAK_NS}" --timeout="${WAIT_TIMEOUT}"

if [[ "${BOOTSTRAP}" == "true" ]]; then
  log "re-running Keycloak bootstrap job"
  kubectl delete job keycloak-bootstrap -n "${KEYCLOAK_NS}" --ignore-not-found
  kubectl apply -f "${KEYCLOAK_MANIFESTS}/bootstrap-job.yaml"
  kubectl wait --for=condition=complete job/keycloak-bootstrap \
    -n "${KEYCLOAK_NS}" --timeout="${WAIT_TIMEOUT}"
  kubectl logs job/keycloak-bootstrap -n "${KEYCLOAK_NS}"
fi

log "redeploy complete"
