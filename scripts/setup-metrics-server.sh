#!/usr/bin/env bash
set -euo pipefail

EXPECTED_CONTEXT="${EXPECTED_CONTEXT:-docker-desktop}"
METRICS_SERVER_MANIFEST="${METRICS_SERVER_MANIFEST:-https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml}"
NAMESPACE="kube-system"
DEPLOYMENT="metrics-server"
DOCKER_DESKTOP_ARG="--kubelet-insecure-tls"

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
kubectl -n "$NAMESPACE" rollout status deployment "$DEPLOYMENT" --timeout=120s

log "checking Metrics API"
kubectl get apiservice v1beta1.metrics.k8s.io

log "checking node metrics"
kubectl top nodes

log "done"
