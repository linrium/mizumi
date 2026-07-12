#!/usr/bin/env bash
set -euo pipefail

UC_NS="${UC_NS:-unitycatalog}"
UC_MANIFESTS="${UC_MANIFESTS:-infra/k8s/unitycatalog}"
UC_IMAGE="${UC_IMAGE:-mizumi-uc:0.1.0}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-300s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"
KIND_CLUSTER="${KIND_CLUSTER:-}"

BUILD=true
BOOTSTRAP=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--skip-build] [--bootstrap]

Redeploy only the Unity Catalog service.

Options:
  --skip-build   Reuse the existing local image tag
  --bootstrap    Re-run infra/k8s/unitycatalog/bootstrap-job.yaml after rollout
  -h, --help     Show this help

Environment:
  UC_IMAGE           Image tag to build (default: mizumi-uc:0.1.0)
  UC_NS              Kubernetes namespace (default: unitycatalog)
  UC_MANIFESTS       Manifest directory (default: infra/k8s/unitycatalog)
  WAIT_TIMEOUT       Rollout/bootstrap wait timeout (default: 300s)
  EXPECTED_CONTEXT   Refuse to run unless this kubectl context is active
  KIND_CLUSTER       If set, run: kind load docker-image --name "\$KIND_CLUSTER"
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
  printf '[unitycatalog] %s\n' "$*"
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

apply_unitycatalog_auth_if_present() {
  local token_file="packages/uc/config/token.txt"
  local key_file="packages/uc/config/server.key"

  local has_token=false has_key=false

  [[ -f "${token_file}" ]] && has_token=true
  [[ -f "${key_file}" ]] && has_key=true

  if [[ "${has_token}" == "false" ]]; then
    log "${token_file} not found; leaving unitycatalog-auth secret unchanged"
    return 0
  fi

  local -a secrets_args=()
  secrets_args+=(--from-literal=UC_INTERNAL_SERVICE_TOKEN="$(<"${token_file}")")

  if [[ "${has_key}" == "true" ]]; then
    secrets_args+=(--from-file=UC_INTERNAL_SERVER_KEY_PEM="${key_file}")
  fi

  kubectl create secret generic unitycatalog-auth \
    -n "${UC_NS}" \
    "${secrets_args[@]}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

require_command kubectl
require_command docker
check_context

if [[ "${BUILD}" == "true" ]]; then
  log "building ${UC_IMAGE}"
  docker build -f packages/uc/Dockerfile -t "${UC_IMAGE}" .

  if [[ -n "${KIND_CLUSTER}" ]]; then
    require_command kind
    log "loading ${UC_IMAGE} into kind cluster ${KIND_CLUSTER}"
    kind load docker-image "${UC_IMAGE}" --name "${KIND_CLUSTER}"
  fi
else
  log "skipping image build"
fi

log "ensuring namespace"
kubectl create namespace "${UC_NS}" 2>/dev/null || true

log "applying Unity Catalog Postgres secret"
kubectl apply -f "${UC_MANIFESTS}/postgres.yaml"

apply_unitycatalog_auth_if_present

log "applying Unity Catalog server config and deployment"
kubectl apply -f "${UC_MANIFESTS}/server.yaml"

log "restarting Unity Catalog deployment"
kubectl rollout restart deployment/unitycatalog -n "${UC_NS}"

log "waiting for rollout"
kubectl rollout status deployment/unitycatalog -n "${UC_NS}" --timeout="${WAIT_TIMEOUT}"

if [[ "${BOOTSTRAP}" == "true" ]]; then
  log "re-running Unity Catalog bootstrap job"
  kubectl delete job unitycatalog-bootstrap -n "${UC_NS}" --ignore-not-found
  kubectl apply -f "${UC_MANIFESTS}/bootstrap-job.yaml"
  kubectl wait --for=condition=complete job/unitycatalog-bootstrap \
    -n "${UC_NS}" --timeout="${WAIT_TIMEOUT}"
  kubectl logs job/unitycatalog-bootstrap -n "${UC_NS}"
fi

log "redeploy complete"
