#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="signoz"
INFRA_NAMESPACE="signoz-infra"
INFRA_RELEASE="signoz-k8s-infra"
INFRA_CHART_VERSION="${SIGNOZ_K8S_INFRA_VERSION:-0.15.1}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-10m}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SIGNOZ_DIR="${ROOT_DIR}/infra/k8s/signoz"
CASTING_FILE="${SIGNOZ_DIR}/casting.yaml"
DEPLOYMENT_DIR="${SIGNOZ_DIR}/pours/deployment"
INFRA_VALUES="${SIGNOZ_DIR}/k8s-infra-values.yaml"
CLICKHOUSE_CRD_BASE="https://raw.githubusercontent.com/Altinity/clickhouse-operator/0.25.3/deploy/operatorhub/0.25.3"

log() {
  printf '[signoz] %s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

check_context() {
  local current_context
  current_context="$(kubectl config current-context)"

  if [[ -n "${EXPECTED_CONTEXT}" && "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
    die "current kubectl context is '${current_context}', expected '${EXPECTED_CONTEXT}'"
  fi

  log "using kubectl context: ${current_context}"
}

rollout_all() {
  local namespace="$1"
  local resource_type="$2"
  local resources

  resources="$(kubectl get "${resource_type}" \
    --namespace "${namespace}" \
    --output=name)"

  if [[ -z "${resources}" ]]; then
    log "no ${resource_type} resources found in ${namespace}"
    return 0
  fi

  while IFS= read -r resource; do
    kubectl rollout status "${resource}" \
      --namespace "${namespace}" \
      --timeout="${WAIT_TIMEOUT}"
  done <<< "${resources}"
}

fix_clickhouse_system_log_config() {
  local manifest="${DEPLOYMENT_DIR}/telemetrystore/clickhouse/clickhouseinstallation.yaml"
  local functions_configmap="${DEPLOYMENT_DIR}/telemetrystore/clickhouse/configmap.yaml"
  local temporary_file

  [[ -f "${manifest}" ]] || die "generated ClickHouse manifest not found: ${manifest}"
  [[ -f "${functions_configmap}" ]] || \
    die "generated ClickHouse functions ConfigMap not found: ${functions_configmap}"
  temporary_file="$(mktemp "${manifest}.XXXXXX")"

  # The Altinity operator injects complete system-log engine expressions that
  # already contain PARTITION BY and TTL. The standalone settings emitted by
  # Foundry conflict with those engines and make ClickHouse exit with code 36.
  awk '
    /^          (partition_by|ttl):/ { next }
    { print }
  ' "${manifest}" > "${temporary_file}"
  mv "${temporary_file}" "${manifest}"

  # Foundry serializes the executable-function definition as YAML but names it
  # .xml. ClickHouse selects the parser from the extension, so use .yaml in the
  # ConfigMap key and in the loader path.
  temporary_file="$(mktemp "${functions_configmap}.XXXXXX")"
  sed 's/custom-functions\.xml/custom-functions.yaml/g' \
    "${functions_configmap}" > "${temporary_file}"
  mv "${temporary_file}" "${functions_configmap}"

  temporary_file="$(mktemp "${manifest}.XXXXXX")"
  sed 's/custom-functions\.xml/custom-functions.yaml/g' \
    "${manifest}" > "${temporary_file}"
  mv "${temporary_file}" "${manifest}"
}

install_clickhouse_crds() {
  local crd

  for crd in \
    clickhouseinstallations.clickhouse.altinity.com.crd.yaml \
    clickhouseinstallationtemplates.clickhouse.altinity.com.crd.yaml \
    clickhouseoperatorconfigurations.clickhouse.altinity.com.crd.yaml \
    clickhousekeeperinstallations.clickhouse-keeper.altinity.com.crd.yaml; do
    kubectl apply -f "${CLICKHOUSE_CRD_BASE}/${crd}"
  done
}

deploy() {
  require_command foundryctl
  require_command kubectl
  require_command helm
  check_context

  log "generating SigNoz Kustomize manifests"
  (
    cd "${SIGNOZ_DIR}"
    foundryctl forge -f "${CASTING_FILE}"
  )

  log "applying ClickHouse 25.12 compatibility fix"
  fix_clickhouse_system_log_config

  log "installing ClickHouse operator CRDs"
  install_clickhouse_crds

  log "applying SigNoz Kustomize manifests"
  kubectl apply -k "${DEPLOYMENT_DIR}"

  log "waiting for SigNoz workloads"
  rollout_all "${NAMESPACE}" deployment
  rollout_all "${NAMESPACE}" statefulset

  log "installing the SigNoz Kubernetes infrastructure collectors"
  helm repo add signoz https://charts.signoz.io --force-update
  helm upgrade --install "${INFRA_RELEASE}" signoz/k8s-infra \
    --namespace "${INFRA_NAMESPACE}" \
    --create-namespace \
    --version "${INFRA_CHART_VERSION}" \
    --values "${INFRA_VALUES}" \
    --wait \
    --timeout "${WAIT_TIMEOUT}"

  rollout_all "${INFRA_NAMESPACE}" daemonset
  rollout_all "${INFRA_NAMESPACE}" deployment

  log "deployment complete"
  log "open the UI with: kubectl port-forward -n ${NAMESPACE} svc/signoz-signoz 8080:8080"
}

destroy() {
  require_command kubectl
  require_command helm
  check_context

  log "removing the SigNoz Kubernetes infrastructure collectors"
  helm uninstall "${INFRA_RELEASE}" \
    --namespace "${INFRA_NAMESPACE}" --ignore-not-found --wait
  kubectl delete namespace "${INFRA_NAMESPACE}" --ignore-not-found --wait=true

  log "removing ClickHouse resources while the operator is still running"
  kubectl delete clickhouseinstallations.clickhouse.altinity.com \
    --all --namespace "${NAMESPACE}" --ignore-not-found --wait=true || true
  kubectl delete clickhousekeeperinstallations.clickhouse-keeper.altinity.com \
    --all --namespace "${NAMESPACE}" --ignore-not-found --wait=true || true

  if [[ -f "${DEPLOYMENT_DIR}/kustomization.yaml" ]]; then
    log "deleting generated Kustomize resources"
    kubectl delete -k "${DEPLOYMENT_DIR}" --ignore-not-found --wait=true || true
  else
    log "generated manifests not found; deleting the ${NAMESPACE} namespace"
    kubectl delete namespace "${NAMESPACE}" --ignore-not-found --wait=true
  fi

  # The namespace is included in generated output, but this also handles partial
  # deployments and older generated manifests.
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found --wait=true
  log "destroy complete (persistent data in the namespace was deleted)"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <deploy|destroy>

Environment variables:
  EXPECTED_CONTEXT   Refuse to run unless this kubectl context is active
  SIGNOZ_K8S_INFRA_VERSION
                     k8s-infra chart version (default: 0.15.1)
  WAIT_TIMEOUT       kubectl wait timeout (default: 10m)

Install foundryctl before deploying:
  curl -fsSL https://signoz.io/foundry.sh | bash
EOF
}

case "${1:-}" in
  deploy) deploy ;;
  destroy) destroy ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
