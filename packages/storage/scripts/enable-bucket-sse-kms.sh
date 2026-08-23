#!/usr/bin/env sh
set -eu

RELEASE=${RELEASE:-rustfs}
NAMESPACE=${NAMESPACE:-storage}
SERVICE=${SERVICE:-$RELEASE-svc}
SECRET_NAME=${SECRET_NAME:-rustfs-auth}
ENDPOINT_URL=${ENDPOINT_URL:-http://127.0.0.1:9000}
LOCAL_PORT=${LOCAL_PORT:-9000}
KMS_KEY_ID=${KMS_KEY_ID:-rustfs-master-key}
AWS_REGION=${AWS_REGION:-us-east-1}

BUCKET=${BUCKET:-${1:-}}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

usage() {
  cat <<EOF
Usage:
  $0 <bucket>

Environment overrides:
  BUCKET=<bucket>
  KMS_KEY_ID=$KMS_KEY_ID
  ENDPOINT_URL=$ENDPOINT_URL
  NAMESPACE=$NAMESPACE
  RELEASE=$RELEASE
  SERVICE=$SERVICE
EOF
}

require_cmd aws
require_cmd kubectl
require_cmd curl

if [ -z "$BUCKET" ]; then
  usage >&2
  exit 1
fi

access_key=$(kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" \
  -o jsonpath='{.data.RUSTFS_ACCESS_KEY}' | base64 -d)
secret_key=$(kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" \
  -o jsonpath='{.data.RUSTFS_SECRET_KEY}' | base64 -d)

tmp_config=$(mktemp)
port_forward_pid=""

cleanup() {
  rm -f "$tmp_config"
  if [ -n "$port_forward_pid" ]; then
    kill "$port_forward_pid" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT HUP INT TERM

cat >"$tmp_config" <<EOF
{
  "Rules": [
    {
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "$KMS_KEY_ID"
      }
    }
  ]
}
EOF

if ! curl -fsS "$ENDPOINT_URL/health" >/dev/null 2>&1; then
  case "$ENDPOINT_URL" in
    http://127.0.0.1:"$LOCAL_PORT"|http://localhost:"$LOCAL_PORT")
      kubectl -n "$NAMESPACE" port-forward "svc/$SERVICE" "$LOCAL_PORT:9000" >/dev/null 2>&1 &
      port_forward_pid=$!

      i=0
      while ! curl -fsS "$ENDPOINT_URL/health" >/dev/null 2>&1; do
        i=$((i + 1))
        if [ "$i" -gt 30 ]; then
          echo "Timed out waiting for RustFS at $ENDPOINT_URL" >&2
          exit 1
        fi
        sleep 1
      done
      ;;
    *)
      echo "RustFS endpoint is not reachable: $ENDPOINT_URL" >&2
      exit 1
      ;;
  esac
fi

AWS_ACCESS_KEY_ID=$access_key \
AWS_SECRET_ACCESS_KEY=$secret_key \
AWS_REGION=$AWS_REGION \
AWS_EC2_METADATA_DISABLED=true \
aws --endpoint-url "$ENDPOINT_URL" s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration "file://$tmp_config"

AWS_ACCESS_KEY_ID=$access_key \
AWS_SECRET_ACCESS_KEY=$secret_key \
AWS_REGION=$AWS_REGION \
AWS_EC2_METADATA_DISABLED=true \
aws --endpoint-url "$ENDPOINT_URL" s3api get-bucket-encryption \
  --bucket "$BUCKET"

cat <<EOF
Bucket SSE-KMS encryption is configured.

Bucket:
  name: $BUCKET
  key:  $KMS_KEY_ID
EOF
