#!/usr/bin/env bash
set -euo pipefail

SHARED_POSTGRES_NS="${SHARED_POSTGRES_NS:-shared-postgres}"
SHARED_POSTGRES_MANIFEST="${SHARED_POSTGRES_MANIFEST:-infra/k8s/shared-postgres/postgres.yaml}"
SHARED_POSTGRES_STATEFULSET="${SHARED_POSTGRES_STATEFULSET:-shared-postgres}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-300s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"
BOOTSTRAP=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--bootstrap]

Redeploy only the shared Postgres StatefulSet.

Options:
  --bootstrap  Re-run scripts/bootstrap-shared-postgres.sh after rollout
  -h, --help   Show this help

Environment:
  SHARED_POSTGRES_NS          Kubernetes namespace (default: shared-postgres)
  SHARED_POSTGRES_MANIFEST    Manifest file (default: infra/k8s/shared-postgres/postgres.yaml)
  SHARED_POSTGRES_STATEFULSET StatefulSet name (default: shared-postgres)
  WAIT_TIMEOUT                Rollout/bootstrap wait timeout (default: 300s)
  EXPECTED_CONTEXT            Refuse to run unless this kubectl context is active
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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
  printf '[shared-postgres] %s\n' "$*"
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
check_context

log "applying shared Postgres manifest"
kubectl apply -f "${SHARED_POSTGRES_MANIFEST}"

log "restarting shared Postgres StatefulSet"
kubectl rollout restart "statefulset/${SHARED_POSTGRES_STATEFULSET}" -n "${SHARED_POSTGRES_NS}"

log "waiting for rollout"
kubectl rollout status "statefulset/${SHARED_POSTGRES_STATEFULSET}" \
  -n "${SHARED_POSTGRES_NS}" --timeout="${WAIT_TIMEOUT}"

if [[ "${BOOTSTRAP}" == "true" ]]; then
  log "re-running shared Postgres bootstrap"
  DAGSTER_NAMESPACE="${SHARED_POSTGRES_NS}" \
  PG_STATEFULSET_NAME="${SHARED_POSTGRES_STATEFULSET}" \
  WAIT_TIMEOUT="${WAIT_TIMEOUT}" \
    ./scripts/bootstrap-shared-postgres.sh
fi

log "redeploy complete"
