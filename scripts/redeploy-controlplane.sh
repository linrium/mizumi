#!/usr/bin/env bash
set -euo pipefail

CONTROLPLANE_NS="${CONTROLPLANE_NS:-controlplane}"
CONTROLPLANE_MANIFESTS="${CONTROLPLANE_MANIFESTS:-infra/k8s/controlplane}"
CONTROLPLANE_IMAGE="${CONTROLPLANE_IMAGE:-mizumi-controlplane:0.1.0}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-120s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"
KIND_CLUSTER="${KIND_CLUSTER:-}"

BUILD=true
BOOTSTRAP=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--skip-build] [--bootstrap]

Redeploy only the controlplane service.

Options:
  --skip-build   Reuse the existing local image tag
  --bootstrap    Re-run infra/k8s/controlplane/bootstrap-job.yaml after rollout
  -h, --help     Show this help

Environment:
  CONTROLPLANE_IMAGE      Image tag to build (default: mizumi-controlplane:0.1.0)
  CONTROLPLANE_NS         Kubernetes namespace (default: controlplane)
  CONTROLPLANE_MANIFESTS  Manifest directory (default: infra/k8s/controlplane)
  WAIT_TIMEOUT            Rollout/bootstrap wait timeout (default: 120s)
  EXPECTED_CONTEXT        Refuse to run unless this kubectl context is active
  KIND_CLUSTER            If set, run: kind load docker-image --name "\$KIND_CLUSTER"
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
  printf '[controlplane] %s\n' "$*"
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

apply_openai_secret_if_configured() {
  if [[ -z "${OPENAI_API_KEY:-}" && -z "${OPENAI_BASE_URL:-}" ]]; then
    log "OPENAI_API_KEY/OPENAI_BASE_URL not set; leaving controlplane-secret unchanged"
    return 0
  fi

  kubectl create secret generic controlplane-secret \
    -n "${CONTROLPLANE_NS}" \
    --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
    --from-literal=OPENAI_BASE_URL="${OPENAI_BASE_URL:-}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_unitycatalog_token_if_present() {
  local token_file="packages/uc/config/token.txt"

  if [[ ! -f "${token_file}" ]]; then
    log "${token_file} not found; leaving unitycatalog-auth secret unchanged"
    return 0
  fi

  kubectl create secret generic unitycatalog-auth \
    -n "${CONTROLPLANE_NS}" \
    --from-file=UC_INTERNAL_SERVICE_TOKEN="${token_file}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

require_command kubectl
require_command docker
check_context

if [[ "${BUILD}" == "true" ]]; then
  log "building ${CONTROLPLANE_IMAGE}"
  docker build -f packages/controlplane/Dockerfile -t "${CONTROLPLANE_IMAGE}" .

  if [[ -n "${KIND_CLUSTER}" ]]; then
    require_command kind
    log "loading ${CONTROLPLANE_IMAGE} into kind cluster ${KIND_CLUSTER}"
    kind load docker-image "${CONTROLPLANE_IMAGE}" --name "${KIND_CLUSTER}"
  fi
else
  log "skipping image build"
fi

log "ensuring namespace and required secrets"
kubectl create namespace "${CONTROLPLANE_NS}" 2>/dev/null || true
apply_openai_secret_if_configured
apply_unitycatalog_token_if_present

log "applying controlplane Postgres alias"
kubectl apply -f "${CONTROLPLANE_MANIFESTS}/postgres.yaml"

log "applying controlplane deployment"
kubectl apply -f "${CONTROLPLANE_MANIFESTS}/deployment.yaml"

log "restarting controlplane deployment"
kubectl rollout restart deployment/controlplane -n "${CONTROLPLANE_NS}"

log "waiting for rollout"
kubectl rollout status deployment/controlplane -n "${CONTROLPLANE_NS}" --timeout="${WAIT_TIMEOUT}"

if [[ "${BOOTSTRAP}" == "true" ]]; then
  log "re-running controlplane bootstrap job"
  kubectl delete job controlplane-bootstrap -n "${CONTROLPLANE_NS}" --ignore-not-found
  kubectl apply -f "${CONTROLPLANE_MANIFESTS}/bootstrap-job.yaml"
  kubectl wait --for=condition=complete job/controlplane-bootstrap \
    -n "${CONTROLPLANE_NS}" --timeout="${WAIT_TIMEOUT}"
  kubectl logs job/controlplane-bootstrap -n "${CONTROLPLANE_NS}"
fi

log "redeploy complete"
