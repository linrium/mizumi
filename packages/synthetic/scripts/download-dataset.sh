#!/usr/bin/env bash
set -euo pipefail

DATASET_URL="https://pub-9bff4c0d6330472ca6187f9d74658c54.r2.dev/baggage-damanged.zip"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
TMP_FILE="$(mktemp /tmp/baggage-damaged-XXXXXX.zip)"

cleanup() { rm -f "$TMP_FILE"; }
trap cleanup EXIT

echo "Downloading dataset..."
curl -fL --progress-bar "$DATASET_URL" -o "$TMP_FILE"

echo "Extracting to $DEST_DIR..."
unzip -o "$TMP_FILE" -d "$DEST_DIR"

echo "Done."
