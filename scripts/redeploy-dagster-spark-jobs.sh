#!/usr/bin/env bash
set -euo pipefail

DAGSTER_NS="${DAGSTER_NS:-dagster}"
DAGSTER_RELEASE="${DAGSTER_RELEASE:-dagster}"
DAGSTER_CHART="${DAGSTER_CHART:-dagster/dagster}"
DAGSTER_CHART_VERSION="${DAGSTER_CHART_VERSION:-1.13.4}"
DAGSTER_VALUES="${DAGSTER_VALUES:-infra/k8s/dagster/helm/values.yaml}"
DAGSTER_IMAGE="${DAGSTER_IMAGE:-mizumi-dagster:1.13.4}"
DAGSTER_POSTGRES_ALIAS="${DAGSTER_POSTGRES_ALIAS:-infra/k8s/dagster/postgres-alias.yaml}"

SPARK_NS="${SPARK_NS:-spark}"
SPARK_IMAGE="${SPARK_IMAGE:-mizumi-spark-rustfs:4.1.3}"
SPARK_OPERATOR_NS="${SPARK_OPERATOR_NS:-spark-operator}"
SPARK_OPERATOR_RELEASE="${SPARK_OPERATOR_RELEASE:-spark-operator}"
SPARK_OPERATOR_CHART="${SPARK_OPERATOR_CHART:-spark-operator/spark-operator}"
SPARK_OPERATOR_CHART_VERSION="${SPARK_OPERATOR_CHART_VERSION:-2.5.0}"
SPARK_OPERATOR_VALUES="${SPARK_OPERATOR_VALUES:-infra/k8s/spark/helm/values.yaml}"

WAIT_TIMEOUT="${WAIT_TIMEOUT:-300s}"
EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-}"

BUILD_DAGSTER=true
BUILD_SPARK=true
INSTALL_DAGSTER=true
INSTALL_SPARK_OPERATOR=true
UPDATE_REPOS=true

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Redeploy Dagster's Spark job launcher path.

This rebuilds the Dagster image that contains asset definitions, rebuilds the
Spark image used by Dagster Pipes jobs, reapplies the Dagster Helm release, and
waits for Dagster to roll out. The Spark jobs themselves are ephemeral pods and
will use the new image/config on the next Dagster materialization.

Options:
  --skip-dagster-build      Reuse the existing ${DAGSTER_IMAGE} image
  --skip-spark-build        Reuse the existing ${SPARK_IMAGE} image
  --skip-dagster            Do not run the Dagster Helm upgrade
  --skip-spark-operator     Do not install/upgrade the Spark operator chart
  --skip-repo-update        Do not add/update Helm repos
  -h, --help                Show this help

Environment:
  DAGSTER_IMAGE             Dagster image tag (default: mizumi-dagster:1.13.4)
  SPARK_IMAGE               Spark image tag (default: mizumi-spark-rustfs:4.1.3)
  DAGSTER_NS                Dagster namespace (default: dagster)
  SPARK_NS                  Spark job namespace (default: spark)
  SPARK_OPERATOR_NS         Spark operator namespace (default: spark-operator)
  WAIT_TIMEOUT              Rollout wait timeout (default: 300s)
  EXPECTED_CONTEXT          Refuse to run unless this kubectl context is active
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-dagster-build)
      BUILD_DAGSTER=false
      shift
      ;;
    --skip-spark-build)
      BUILD_SPARK=false
      shift
      ;;
    --skip-dagster)
      INSTALL_DAGSTER=false
      shift
      ;;
    --skip-spark-operator)
      INSTALL_SPARK_OPERATOR=false
      shift
      ;;
    --skip-repo-update)
      UPDATE_REPOS=false
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
  printf '[dagster-spark] %s\n' "$*"
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
require_command helm
check_context

if [[ "${UPDATE_REPOS}" == "true" ]]; then
  log "adding/updating Helm repos"
  helm repo add dagster https://dagster-io.github.io/helm >/dev/null 2>&1 || true
  helm repo add spark-operator https://kubeflow.github.io/spark-operator >/dev/null 2>&1 || true
  helm repo update dagster spark-operator
else
  log "skipping Helm repo update"
fi

if [[ "${BUILD_DAGSTER}" == "true" ]]; then
  log "building ${DAGSTER_IMAGE}"
  docker build -t "${DAGSTER_IMAGE}" -f packages/dagster/Dockerfile .
else
  log "skipping Dagster image build"
fi

if [[ "${BUILD_SPARK}" == "true" ]]; then
  log "building ${SPARK_IMAGE}"
  docker build -t "${SPARK_IMAGE}" packages/spark
else
  log "skipping Spark image build"
fi

if [[ "${INSTALL_SPARK_OPERATOR}" == "true" ]]; then
  log "ensuring Spark namespaces"
  kubectl create namespace "${SPARK_NS}" >/dev/null 2>&1 || true
  kubectl create namespace "${SPARK_OPERATOR_NS}" >/dev/null 2>&1 || true

  log "installing/upgrading Spark operator"
  helm upgrade --install "${SPARK_OPERATOR_RELEASE}" "${SPARK_OPERATOR_CHART}" \
    --namespace "${SPARK_OPERATOR_NS}" \
    --create-namespace \
    --version "${SPARK_OPERATOR_CHART_VERSION}" \
    --values "${SPARK_OPERATOR_VALUES}"

  log "waiting for Spark operator rollout"
  kubectl wait --namespace "${SPARK_OPERATOR_NS}" \
    --for=condition=Available deployment \
    --all \
    --timeout="${WAIT_TIMEOUT}"
else
  log "skipping Spark operator upgrade"
fi

if [[ "${INSTALL_DAGSTER}" == "true" ]]; then
  log "ensuring Dagster namespace and Postgres alias"
  kubectl create namespace "${DAGSTER_NS}" >/dev/null 2>&1 || true
  kubectl apply -f "${DAGSTER_POSTGRES_ALIAS}"

  log "installing/upgrading Dagster"
  helm upgrade --install "${DAGSTER_RELEASE}" "${DAGSTER_CHART}" \
    --namespace "${DAGSTER_NS}" \
    --create-namespace \
    --version "${DAGSTER_CHART_VERSION}" \
    --values "${DAGSTER_VALUES}"

  log "restarting Dagster deployments"
  kubectl rollout restart deployment/"${DAGSTER_RELEASE}"-daemon -n "${DAGSTER_NS}"
  kubectl rollout restart \
    deployment/"${DAGSTER_RELEASE}"-dagster-user-deployments-mizumi \
    -n "${DAGSTER_NS}"
  kubectl rollout restart \
    deployment/"${DAGSTER_RELEASE}"-dagster-webserver \
    -n "${DAGSTER_NS}"

  log "waiting for Dagster daemon"
  kubectl rollout status \
    deployment/"${DAGSTER_RELEASE}"-daemon \
    -n "${DAGSTER_NS}" \
    --timeout="${WAIT_TIMEOUT}"

  log "waiting for Dagster user deployment"
  kubectl rollout status \
    deployment/"${DAGSTER_RELEASE}"-dagster-user-deployments-mizumi \
    -n "${DAGSTER_NS}" \
    --timeout="${WAIT_TIMEOUT}"

  log "waiting for Dagster webserver"
  kubectl rollout status \
    deployment/"${DAGSTER_RELEASE}"-dagster-webserver \
    -n "${DAGSTER_NS}" \
    --timeout="${WAIT_TIMEOUT}"
else
  log "skipping Dagster Helm upgrade"
fi

log "redeploy complete"
