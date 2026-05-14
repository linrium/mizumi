#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="unitycatalog"
TOKEN_PATH="./etc/conf/token.txt"

echo "Fetching UC token from container..."
POD=$(kubectl get pod -n "$NAMESPACE" -l app=unitycatalog -o jsonpath='{.items[0].metadata.name}')
UC_TOKEN=$(kubectl exec -n "$NAMESPACE" "$POD" -- cat "$TOKEN_PATH")

echo "Running init.py..."
UC_TOKEN="$UC_TOKEN" python "$(dirname "$0")/init.py"
