#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

IMAGE_NAME=${IMAGE_NAME:-chronicle:latest}
CONTEXT=${KUBE_CONTEXT:-kind-node1}
NAMESPACE=${NAMESPACE:-chronicle}
DEPLOYED_AT=$(date +%Y%m%d%H%M%S)

if [ -n "${KIND_CLUSTER_NAME:-}" ]; then
  CLUSTER_NAME=$KIND_CLUSTER_NAME
else
  case "$CONTEXT" in
    kind-*) CLUSTER_NAME=${CONTEXT#kind-} ;;
    *) echo "Set KIND_CLUSTER_NAME when deploying to non-kind context '$CONTEXT'." >&2; exit 1 ;;
  esac
fi

current_context=$(kubectl config current-context)
if [ "$current_context" != "$CONTEXT" ]; then
  echo "Refusing to deploy to Kubernetes context '$current_context'."
  echo "Set KUBE_CONTEXT=$current_context to deploy there, or switch to '$CONTEXT'."
  exit 1
fi

echo "Building $IMAGE_NAME"
docker build -t "$IMAGE_NAME" "$APP_DIR"

echo "Loading $IMAGE_NAME into kind cluster $CLUSTER_NAME"
kind load docker-image "$IMAGE_NAME" --name "$CLUSTER_NAME"

echo "Applying Kubernetes manifests to context $CONTEXT"
kubectl apply -k "$APP_DIR/manifests"

echo "Waiting for rollout"
kubectl -n "$NAMESPACE" rollout status deployment/chronicle

echo "Deployment ready."
echo "Run: kubectl -n $NAMESPACE port-forward svc/chronicle 3000:80"
