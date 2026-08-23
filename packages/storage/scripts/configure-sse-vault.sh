#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

RELEASE=${RELEASE:-rustfs}
NAMESPACE=${NAMESPACE:-storage}
CHART=${CHART:-rustfs/rustfs}
CHART_VERSION=${CHART_VERSION:-0.10.0}
SECRET_NAME=${SECRET_NAME:-rustfs-auth}

VAULT_RELEASE=${VAULT_RELEASE:-vault}
VAULT_NAMESPACE=${VAULT_NAMESPACE:-vault}
VAULT_POD=${VAULT_POD:-$VAULT_RELEASE-0}
VAULT_EXEC_ADDR=${VAULT_EXEC_ADDR:-http://127.0.0.1:8200}
VAULT_RUSTFS_ADDR=${VAULT_RUSTFS_ADDR:-http://$VAULT_RELEASE.$VAULT_NAMESPACE.svc:8200}
VAULT_MOUNT_PATH=${VAULT_MOUNT_PATH:-transit}
VAULT_KV_MOUNT_PATH=${VAULT_KV_MOUNT_PATH:-secret}
VAULT_KEY=${VAULT_KEY:-rustfs-master-key}
VAULT_POLICY=${VAULT_POLICY:-rustfs-kms}
KMS_SECRET_NAME=${KMS_SECRET_NAME:-rustfs-kms-vault}
ALLOW_INSECURE_DEV_DEFAULTS=${RUSTFS_KMS_ALLOW_INSECURE_DEV_DEFAULTS:-}

if [ -z "$ALLOW_INSECURE_DEV_DEFAULTS" ]; then
  case "$VAULT_RUSTFS_ADDR" in
    http://*) ALLOW_INSECURE_DEV_DEFAULTS=true ;;
    *) ALLOW_INSECURE_DEV_DEFAULTS=false ;;
  esac
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

vault_exec() {
  kubectl -n "$VAULT_NAMESPACE" exec "$VAULT_POD" -- \
    env VAULT_ADDR="$VAULT_EXEC_ADDR" VAULT_TOKEN="$VAULT_TOKEN" vault "$@"
}

vault_exec_stdin() {
  kubectl -n "$VAULT_NAMESPACE" exec -i "$VAULT_POD" -- \
    env VAULT_ADDR="$VAULT_EXEC_ADDR" VAULT_TOKEN="$VAULT_TOKEN" vault "$@"
}

require_cmd helm
require_cmd kubectl

if [ -z "${VAULT_TOKEN:-}" ] && [ -z "${RUSTFS_KMS_VAULT_TOKEN:-}" ]; then
  cat >&2 <<EOF
Set VAULT_TOKEN to a Vault admin/root token, or set RUSTFS_KMS_VAULT_TOKEN to
reuse an already-created RustFS Vault token.

Example:
  VAULT_TOKEN=... $0
EOF
  exit 1
fi

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

if ! kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" >/dev/null 2>&1; then
  access_key=${RUSTFS_ACCESS_KEY:-admin}
  secret_key=${RUSTFS_SECRET_KEY:-adminadmin}

  kubectl -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
    --from-literal=RUSTFS_ACCESS_KEY="$access_key" \
    --from-literal=RUSTFS_SECRET_KEY="$secret_key"
fi

if [ -n "${VAULT_TOKEN:-}" ]; then
  kubectl -n "$VAULT_NAMESPACE" wait --for=create pod/"$VAULT_POD" --timeout=120s

  if ! vault_exec status >/dev/null; then
    cat >&2 <<EOF
Vault is not ready for configuration. Initialize and unseal it first, then rerun:
  kubectl -n $VAULT_NAMESPACE exec -it $VAULT_POD -- vault operator init
  kubectl -n $VAULT_NAMESPACE exec -it $VAULT_POD -- vault operator unseal
EOF
    exit 1
  fi

  if ! vault_exec secrets list | grep -q "^$VAULT_MOUNT_PATH/"; then
    vault_exec secrets enable -path="$VAULT_MOUNT_PATH" transit
  fi

  if ! vault_exec secrets list | grep -q "^$VAULT_KV_MOUNT_PATH/"; then
    vault_exec secrets enable -path="$VAULT_KV_MOUNT_PATH" kv-v2
  fi

  if ! vault_exec read "$VAULT_MOUNT_PATH/keys/$VAULT_KEY" >/dev/null 2>&1; then
    vault_exec write -f "$VAULT_MOUNT_PATH/keys/$VAULT_KEY"
  fi

  vault_policy=$(cat <<EOF
path "sys/health" {
  capabilities = ["read"]
}

path "$VAULT_MOUNT_PATH/keys" {
  capabilities = ["list"]
}

path "$VAULT_MOUNT_PATH/keys/" {
  capabilities = ["list"]
}

path "$VAULT_MOUNT_PATH/keys/*" {
  capabilities = ["read", "list"]
}

path "$VAULT_MOUNT_PATH/keys/$VAULT_KEY" {
  capabilities = ["read"]
}

path "$VAULT_MOUNT_PATH/encrypt/$VAULT_KEY" {
  capabilities = ["update"]
}

path "$VAULT_MOUNT_PATH/decrypt/$VAULT_KEY" {
  capabilities = ["update"]
}

path "$VAULT_MOUNT_PATH/datakey/plaintext/$VAULT_KEY" {
  capabilities = ["update"]
}

path "$VAULT_MOUNT_PATH/datakey/wrapped/$VAULT_KEY" {
  capabilities = ["update"]
}

path "$VAULT_MOUNT_PATH/rewrap/$VAULT_KEY" {
  capabilities = ["update"]
}

path "$VAULT_KV_MOUNT_PATH/data/rustfs/kms/transit-metadata/*" {
  capabilities = ["create", "read", "update"]
}

path "$VAULT_KV_MOUNT_PATH/metadata/rustfs/kms/transit-metadata" {
  capabilities = ["list", "read"]
}

path "$VAULT_KV_MOUNT_PATH/metadata/rustfs/kms/transit-metadata/*" {
  capabilities = ["list", "read"]
}
EOF
)

  printf '%s\n' "$vault_policy" | vault_exec_stdin policy write "$VAULT_POLICY" -

  rustfs_kms_token=${RUSTFS_KMS_VAULT_TOKEN:-}
  if [ -z "$rustfs_kms_token" ]; then
    rustfs_kms_token=$(vault_exec token create -policy="$VAULT_POLICY" -field=token)
  fi
else
  rustfs_kms_token=$RUSTFS_KMS_VAULT_TOKEN
fi

kubectl -n "$NAMESPACE" create secret generic "$KMS_SECRET_NAME" \
  --from-literal=RUSTFS_KMS_VAULT_TOKEN="$rustfs_kms_token" \
  --dry-run=client -o yaml | kubectl apply -f -

tmp_values=$(mktemp)
trap 'rm -f "$tmp_values"' EXIT HUP INT TERM

cat >"$tmp_values" <<EOF
extraEnv:
  - name: RUSTFS_KMS_ENABLE
    value: "true"
  - name: RUSTFS_KMS_BACKEND
    value: "vault-transit"
  - name: RUSTFS_KMS_VAULT_ADDRESS
    value: "$VAULT_RUSTFS_ADDR"
  - name: RUSTFS_KMS_ALLOW_INSECURE_DEV_DEFAULTS
    value: "$ALLOW_INSECURE_DEV_DEFAULTS"
  - name: RUSTFS_KMS_VAULT_MOUNT_PATH
    value: "$VAULT_MOUNT_PATH"
  - name: RUSTFS_KMS_DEFAULT_KEY_ID
    value: "$VAULT_KEY"
  - name: RUSTFS_KMS_VAULT_TOKEN
    valueFrom:
      secretKeyRef:
        name: "$KMS_SECRET_NAME"
        key: RUSTFS_KMS_VAULT_TOKEN
EOF

helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --version "$CHART_VERSION" \
  -f "$APP_DIR/values.yaml" \
  -f "$tmp_values"

kubectl -n "$NAMESPACE" rollout restart deployment/"$RELEASE"
kubectl -n "$NAMESPACE" rollout status deployment/"$RELEASE"

cat <<EOF
RustFS SSE with HashiCorp Vault transit is configured.

RustFS:
  release:   $RELEASE
  namespace: $NAMESPACE

Vault:
  address:   $VAULT_RUSTFS_ADDR
  mount:     $VAULT_MOUNT_PATH
  kv mount:  $VAULT_KV_MOUNT_PATH
  key:       $VAULT_KEY
  policy:    $VAULT_POLICY
  token ref: secret/$KMS_SECRET_NAME
  insecure dev defaults: $ALLOW_INSECURE_DEV_DEFAULTS
EOF
