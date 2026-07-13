#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="signoz"
INFRA_NAMESPACE="signoz-infra"
INFRA_RELEASE="signoz-k8s-infra"
INFRA_CHART_VERSION="${SIGNOZ_K8S_INFRA_VERSION:-0.15.1}"
OTEL_OPERATOR_NAMESPACE="${OTEL_OPERATOR_NAMESPACE:-opentelemetry-operator-system}"
OTEL_OPERATOR_RELEASE="${OTEL_OPERATOR_RELEASE:-opentelemetry-operator}"
OTEL_OPERATOR_CHART_VERSION="${OTEL_OPERATOR_CHART_VERSION:-}"
CERT_MANAGER_NAMESPACE="${CERT_MANAGER_NAMESPACE:-cert-manager}"
CERT_MANAGER_RELEASE="${CERT_MANAGER_RELEASE:-cert-manager}"
CERT_MANAGER_CHART_VERSION="${CERT_MANAGER_CHART_VERSION:-}"
SIGNOZ_INSTALL_CERT_MANAGER="${SIGNOZ_INSTALL_CERT_MANAGER:-true}"
SIGNOZ_UNINSTALL_CERT_MANAGER="${SIGNOZ_UNINSTALL_CERT_MANAGER:-false}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-10m}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SIGNOZ_DIR="${ROOT_DIR}/infra/k8s/signoz"
CASTING_FILE="${SIGNOZ_DIR}/casting.yaml"
DEPLOYMENT_DIR="${SIGNOZ_DIR}/pours/deployment"
INFRA_VALUES="${SIGNOZ_DIR}/k8s-infra-values.yaml"
OTEL_INSTRUMENTATION_MANIFEST="${SIGNOZ_DIR}/otel-operator/instrumentation.yaml"
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

ensure_foundryctl() {
  if command -v foundryctl >/dev/null 2>&1; then
    return 0
  fi

  require_command curl
  log "foundryctl not found; installing SigNoz Foundry"
  curl -fsSL https://signoz.io/foundry.sh | bash

  command -v foundryctl >/dev/null 2>&1 || \
    die "foundryctl was not found after running the SigNoz Foundry installer"
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

install_cert_manager() {
  if [[ "${SIGNOZ_INSTALL_CERT_MANAGER}" != "true" ]]; then
    log "skipping cert-manager installation"
    return 0
  fi

  if kubectl get deployment cert-manager \
    --namespace "${CERT_MANAGER_NAMESPACE}" >/dev/null 2>&1; then
    log "cert-manager is already installed"
    return 0
  fi

  log "installing cert-manager for OpenTelemetry Operator webhooks"
  set --
  if [[ -n "${CERT_MANAGER_CHART_VERSION}" ]]; then
    set -- --version "${CERT_MANAGER_CHART_VERSION}"
  fi

  helm repo add jetstack https://charts.jetstack.io --force-update
  helm upgrade --install "${CERT_MANAGER_RELEASE}" jetstack/cert-manager \
    --namespace "${CERT_MANAGER_NAMESPACE}" \
    --create-namespace \
    "$@" \
    --set crds.enabled=true \
    --wait \
    --timeout "${WAIT_TIMEOUT}"
}

install_otel_operator() {
  log "installing OpenTelemetry Operator"
  local cert_manager_enabled="true"
  local auto_generate_cert_enabled="false"

  if [[ "${SIGNOZ_INSTALL_CERT_MANAGER}" != "true" ]]; then
    cert_manager_enabled="false"
    auto_generate_cert_enabled="true"
  fi

  helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts --force-update
  set --
  if [[ -n "${OTEL_OPERATOR_CHART_VERSION}" ]]; then
    set -- --version "${OTEL_OPERATOR_CHART_VERSION}"
  fi

  helm upgrade --install "${OTEL_OPERATOR_RELEASE}" open-telemetry/opentelemetry-operator \
    --namespace "${OTEL_OPERATOR_NAMESPACE}" \
    --create-namespace \
    "$@" \
    --set "admissionWebhooks.certManager.enabled=${cert_manager_enabled}" \
    --set "admissionWebhooks.autoGenerateCert.enabled=${auto_generate_cert_enabled}" \
    --wait \
    --timeout "${WAIT_TIMEOUT}"

  kubectl wait --for=condition=Established crd/instrumentations.opentelemetry.io \
    --timeout="${WAIT_TIMEOUT}"
}

deploy() {
  ensure_foundryctl
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

  install_cert_manager
  install_otel_operator

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

  log "applying default OpenTelemetry auto-instrumentation configuration"
  kubectl apply -f "${OTEL_INSTRUMENTATION_MANIFEST}"

  log "deployment complete"
  log "open the UI with: kubectl port-forward -n ${NAMESPACE} svc/signoz-signoz 8080:8080"
  log "auto-instrument workloads with annotations such as: instrumentation.opentelemetry.io/inject-python=signoz-infra/signoz-instrumentation"
}

destroy() {
  require_command kubectl
  require_command helm
  check_context

  log "removing the SigNoz Kubernetes infrastructure collectors"
  kubectl delete -f "${OTEL_INSTRUMENTATION_MANIFEST}" --ignore-not-found --wait=true || true
  helm uninstall "${INFRA_RELEASE}" \
    --namespace "${INFRA_NAMESPACE}" --ignore-not-found --wait
  kubectl delete namespace "${INFRA_NAMESPACE}" --ignore-not-found --wait=true

  log "removing the OpenTelemetry Operator"
  helm uninstall "${OTEL_OPERATOR_RELEASE}" \
    --namespace "${OTEL_OPERATOR_NAMESPACE}" --ignore-not-found --wait || true
  kubectl delete namespace "${OTEL_OPERATOR_NAMESPACE}" --ignore-not-found --wait=true

  if [[ "${SIGNOZ_UNINSTALL_CERT_MANAGER}" == "true" ]]; then
    log "removing cert-manager"
    helm uninstall "${CERT_MANAGER_RELEASE}" \
      --namespace "${CERT_MANAGER_NAMESPACE}" --ignore-not-found --wait || true
    kubectl delete namespace "${CERT_MANAGER_NAMESPACE}" --ignore-not-found --wait=true
  fi

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
  OTEL_OPERATOR_CHART_VERSION
                     opentelemetry-operator chart version (default: latest)
  OTEL_OPERATOR_NAMESPACE
                     namespace for the OpenTelemetry Operator
                     (default: opentelemetry-operator-system)
  SIGNOZ_INSTALL_CERT_MANAGER
                     install cert-manager if it is missing (default: true)
  CERT_MANAGER_CHART_VERSION
                     cert-manager chart version (default: latest)
  SIGNOZ_UNINSTALL_CERT_MANAGER
                     remove cert-manager on destroy (default: false)
  WAIT_TIMEOUT       kubectl wait timeout (default: 10m)

foundryctl is installed automatically during deploy if it is missing.
EOF
}

case "${1:-}" in
  deploy) deploy ;;
  destroy) destroy ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
