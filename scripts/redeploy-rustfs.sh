#!/usr/bin/env bash
set -euo pipefail

RUSTFS_NS="${RUSTFS_NS:-rustfs}"
RUSTFS_RELEASE="${RUSTFS_RELEASE:-rustfs}"
RUSTFS_CHART="${RUSTFS_CHART:-rustfs/rustfs}"
RUSTFS_CHART_VERSION="${RUSTFS_CHART_VERSION:-0.1.0}"
RUSTFS_VALUES="${RUSTFS_VALUES:-infra/k8s/rustfs/helm/values.yaml}"
RUSTFS_S3_PROXY_MANIFEST="${RUSTFS_S3_PROXY_MANIFEST:-infra/k8s/rustfs/s3-proxy.yaml}"
SPARK_NS="${SPARK_NS:-spark}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"

UPDATE_REPO=true
APPLY_S3_PROXY=true
PATCH_COREDNS=true

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Redeploy RustFS from the local Helm values and optionally refresh the S3 proxy.

Options:
  --skip-repo-update     Do not add/update the RustFS Helm repo
  --skip-s3-proxy        Do not apply infra/k8s/rustfs/s3-proxy.yaml
  --skip-coredns-patch   Do not patch CoreDNS S3 hostname rewrites
  -h, --help             Show this help

Environment:
  RUSTFS_NS              Kubernetes namespace (default: rustfs)
  RUSTFS_RELEASE         Helm release name (default: rustfs)
  RUSTFS_CHART_VERSION   RustFS chart version (default: 0.1.0)
  RUSTFS_VALUES          Helm values file (default: infra/k8s/rustfs/helm/values.yaml)
  WAIT_TIMEOUT           Rollout wait timeout (default: 180s)
  EXPECTED_CONTEXT       Refuse to run unless this kubectl context is active
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-repo-update)
      UPDATE_REPO=false
      shift
      ;;
    --skip-s3-proxy)
      APPLY_S3_PROXY=false
      PATCH_COREDNS=false
      shift
      ;;
    --skip-coredns-patch)
      PATCH_COREDNS=false
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
  printf '[rustfs] %s\n' "$*"
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

patch_coredns_for_s3_proxy() {
  local corefile
  corefile="$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}')"

  if echo "${corefile}" | grep -q 'rustfs-s3-proxy'; then
    log "CoreDNS already has RustFS S3 proxy rewrites"
    return 0
  fi

  local patched
  patched="$(echo "${corefile}" | awk '
    /^[ \t]*ready$/ {
      print
      print "    rewrite name exact s3.us-east-1.amazonaws.com rustfs-s3-proxy.rustfs.svc.cluster.local"
      print "    rewrite name exact unitycatalog.s3.us-east-1.amazonaws.com rustfs-s3-proxy.rustfs.svc.cluster.local"
      next
    }
    { print }
  ')"

  kubectl patch configmap coredns -n kube-system \
    --patch "{\"data\":{\"Corefile\":$(printf '%s' "${patched}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}}"
  kubectl rollout restart deployment/coredns -n kube-system
  kubectl rollout status deployment/coredns -n kube-system --timeout=120s
}

require_command kubectl
require_command helm
require_command python3

[[ -f "${RUSTFS_VALUES}" ]] || {
  echo "RustFS values file not found: ${RUSTFS_VALUES}" >&2
  exit 1
}

check_context

if [[ "${UPDATE_REPO}" == "true" ]]; then
  log "adding/updating RustFS Helm repo"
  helm repo add rustfs https://charts.rustfs.com/ >/dev/null 2>&1 || true
  helm repo update rustfs
else
  log "skipping Helm repo update"
fi

log "installing/upgrading RustFS Helm release"
helm upgrade --install "${RUSTFS_RELEASE}" "${RUSTFS_CHART}" \
  --namespace "${RUSTFS_NS}" \
  --create-namespace \
  --version "${RUSTFS_CHART_VERSION}" \
  --values "${RUSTFS_VALUES}"

log "waiting for RustFS rollout"
kubectl rollout status "deployment/${RUSTFS_RELEASE}" \
  --namespace "${RUSTFS_NS}" \
  --timeout="${WAIT_TIMEOUT}"

if [[ "${APPLY_S3_PROXY}" == "true" ]]; then
  [[ -f "${RUSTFS_S3_PROXY_MANIFEST}" ]] || {
    echo "RustFS S3 proxy manifest not found: ${RUSTFS_S3_PROXY_MANIFEST}" >&2
    exit 1
  }

  log "ensuring RustFS and Spark namespaces for S3 proxy resources"
  kubectl create namespace "${RUSTFS_NS}" >/dev/null 2>&1 || true
  kubectl create namespace "${SPARK_NS}" >/dev/null 2>&1 || true

  log "applying RustFS S3 proxy manifest"
  kubectl apply -f "${RUSTFS_S3_PROXY_MANIFEST}"

  log "waiting for RustFS S3 proxy rollout"
  kubectl rollout status deployment/rustfs-s3-proxy \
    --namespace "${RUSTFS_NS}" \
    --timeout=120s
else
  log "skipping S3 proxy apply"
fi

if [[ "${PATCH_COREDNS}" == "true" ]]; then
  log "patching CoreDNS S3 proxy rewrites"
  patch_coredns_for_s3_proxy
else
  log "skipping CoreDNS patch"
fi

log "redeploy complete"
