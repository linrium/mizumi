#!/usr/bin/env bash
set -euo pipefail

EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-docker-desktop}"
METRICS_SERVER_VERSION="${METRICS_SERVER_VERSION:-v0.8.1}"
METRICS_SERVER_MANIFEST="${METRICS_SERVER_MANIFEST:-https://github.com/kubernetes-sigs/metrics-server/releases/download/${METRICS_SERVER_VERSION}/components.yaml}"
NAMESPACE="kube-system"
DEPLOYMENT="metrics-server"
API_SERVICE="v1beta1.metrics.k8s.io"
DOCKER_DESKTOP_ARG="--kubelet-insecure-tls"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-180}"

log() {
  printf '[metrics-server] %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'error: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

require_command kubectl

current_context="$(kubectl config current-context)"
if [[ "$current_context" != "$EXPECTED_CONTEXT" ]]; then
  cat >&2 <<EOF
error: current kubectl context is "$current_context", expected "$EXPECTED_CONTEXT".

Set the Docker Desktop context first:
  kubectl config use-context docker-desktop

Or override the expected context:
  EXPECTED_CONTEXT="$current_context" $0
EOF
  exit 1
fi

log "using kubectl context: $current_context"
log "applying metrics-server manifest"
kubectl apply -f "$METRICS_SERVER_MANIFEST"

if kubectl -n "$NAMESPACE" get deployment "$DEPLOYMENT" \
  -o jsonpath='{.spec.template.spec.containers[0].args}' | grep -q -- "$DOCKER_DESKTOP_ARG"; then
  log "$DOCKER_DESKTOP_ARG is already configured"
else
  log "patching $DEPLOYMENT with $DOCKER_DESKTOP_ARG"
  kubectl -n "$NAMESPACE" patch deployment "$DEPLOYMENT" --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
fi

log "waiting for rollout"
kubectl -n "$NAMESPACE" rollout status deployment "$DEPLOYMENT" --timeout="${WAIT_TIMEOUT_SECONDS}s"

log "checking Metrics API"
kubectl get apiservice "$API_SERVICE"

log "waiting for Metrics APIService availability"
deadline=$((SECONDS + WAIT_TIMEOUT_SECONDS))
while true; do
  available="$(kubectl get apiservice "$API_SERVICE" -o jsonpath='{.status.conditions[?(@.type=="Available")].status}')"
  if [[ "$available" == "True" ]]; then
    break
  fi

  if (( SECONDS >= deadline )); then
    log "Metrics APIService did not become available within ${WAIT_TIMEOUT_SECONDS}s"
    kubectl describe apiservice "$API_SERVICE" >&2 || true
    kubectl -n "$NAMESPACE" get pods -l k8s-app="$DEPLOYMENT" -o wide >&2 || true
    kubectl -n "$NAMESPACE" logs deployment/"$DEPLOYMENT" --tail=200 >&2 || true
    exit 1
  fi

  sleep 5
done

log "checking node metrics"
deadline=$((SECONDS + WAIT_TIMEOUT_SECONDS))
while true; do
  if kubectl top nodes; then
    break
  fi

  if (( SECONDS >= deadline )); then
    printf 'error: Metrics API not available after %ss\n' "$WAIT_TIMEOUT_SECONDS" >&2
    kubectl describe apiservice "$API_SERVICE" >&2 || true
    kubectl -n "$NAMESPACE" logs deployment/"$DEPLOYMENT" --tail=200 >&2 || true
    exit 1
  fi

  sleep 5
done

log "done"
