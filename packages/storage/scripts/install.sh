#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

RELEASE=${RELEASE:-rustfs}
NAMESPACE=${NAMESPACE:-storage}
CHART=${CHART:-rustfs/rustfs}
CHART_VERSION=${CHART_VERSION:-0.10.0}
SECRET_NAME=${SECRET_NAME:-rustfs-auth}

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

if ! kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" >/dev/null 2>&1; then
  access_key=${RUSTFS_ACCESS_KEY:-admin}
  secret_key=${RUSTFS_SECRET_KEY:-adminadmin}

  kubectl -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
    --from-literal=RUSTFS_ACCESS_KEY="$access_key" \
    --from-literal=RUSTFS_SECRET_KEY="$secret_key"
fi

helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --version "$CHART_VERSION" \
  -f "$APP_DIR/values.yaml"

kubectl -n "$NAMESPACE" rollout status deployment/"$RELEASE"

cat <<EOF
RustFS is installed.

API:
  kubectl -n $NAMESPACE port-forward svc/$RELEASE-svc 9000:9000

Console:
  kubectl -n $NAMESPACE port-forward svc/$RELEASE-svc 9001:9001

Credentials are stored in secret/$SECRET_NAME.
EOF
