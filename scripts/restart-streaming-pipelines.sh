#!/usr/bin/env bash
set -euo pipefail

CONTROLPLANE_URL="${CONTROLPLANE_URL:-http://127.0.0.1:4000}"
AUTH_TOKEN="${AUTH_TOKEN:-test}"
RESTART_ALL=false
WAIT_SECONDS="${WAIT_SECONDS:-3}"
declare -a TARGET_NAMES=(
  "vietjetair-stream-flight-tickets-to-bronze"
  "vietjetair-stream-flight-incidents-to-bronze"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Restart Spark streaming pipelines through the controlplane API.

By default this restarts the two VietJetAir streaming pipelines:
  - vietjetair-stream-flight-tickets-to-bronze
  - vietjetair-stream-flight-incidents-to-bronze

Options:
  --all             Restart every streaming job returned by controlplane
  --name NAME       Restart a specific streaming job name; repeatable
  --url URL         Controlplane base URL (default: ${CONTROLPLANE_URL})
  --token TOKEN     Bearer token (default: ${AUTH_TOKEN})
  --wait SECONDS    Seconds to sleep between restarts (default: ${WAIT_SECONDS})
  -h, --help        Show this help

Environment:
  CONTROLPLANE_URL  Controlplane base URL
  AUTH_TOKEN        Authorization bearer token
  WAIT_SECONDS      Seconds to sleep between restarts
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      RESTART_ALL=true
      shift
      ;;
    --name)
      [[ $# -ge 2 ]] || {
        echo "--name requires a value" >&2
        exit 2
      }
      if [[ "${#TARGET_NAMES[@]}" -eq 2 && "${TARGET_NAMES[0]}" == "vietjetair-stream-flight-tickets-to-bronze" ]]; then
        TARGET_NAMES=()
      fi
      TARGET_NAMES+=("$2")
      shift 2
      ;;
    --url)
      [[ $# -ge 2 ]] || {
        echo "--url requires a value" >&2
        exit 2
      }
      CONTROLPLANE_URL="$2"
      shift 2
      ;;
    --token)
      [[ $# -ge 2 ]] || {
        echo "--token requires a value" >&2
        exit 2
      }
      AUTH_TOKEN="$2"
      shift 2
      ;;
    --wait)
      [[ $# -ge 2 ]] || {
        echo "--wait requires a value" >&2
        exit 2
      }
      WAIT_SECONDS="$2"
      shift 2
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

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "required command not found: $1" >&2
    exit 1
  }
}

api_url() {
  local path="$1"
  printf '%s/%s' "${CONTROLPLANE_URL%/}" "${path#/}"
}

curl_api() {
  curl -fsS \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

extract_jobs() {
  local json_file="$1"
  python3 - "$json_file" "${TARGET_NAMES[@]}" <<'PY'
import json
import sys

path = sys.argv[1]
targets = set(sys.argv[2:])
with open(path, encoding="utf-8") as f:
    jobs = json.load(f).get("jobs", [])

for job in jobs:
    name = job.get("name", "")
    if not targets or name in targets:
        print(f"{job.get('id', '')}\t{name}\t{job.get('namespace', '')}\t{job.get('k8s_status', {}).get('state', 'UNKNOWN')}")
PY
}

require_command curl
require_command python3

jobs_file="$(mktemp /tmp/mizumi-streaming-jobs.XXXXXX)"
trap 'rm -f "$jobs_file"' EXIT

echo "[streaming] listing jobs from ${CONTROLPLANE_URL}"
curl_api "$(api_url /api/streaming/jobs)" >"$jobs_file"

if [[ "${RESTART_ALL}" == "true" ]]; then
  TARGET_NAMES=()
fi

jobs=()
while IFS= read -r row; do
  jobs+=("$row")
done < <(extract_jobs "$jobs_file")

if [[ "${#jobs[@]}" -eq 0 ]]; then
  if [[ "${RESTART_ALL}" == "true" ]]; then
    echo "no streaming jobs found" >&2
  else
    echo "none of the requested streaming jobs were found:" >&2
    printf '  %s\n' "${TARGET_NAMES[@]}" >&2
  fi
  exit 1
fi

for row in "${jobs[@]}"; do
  IFS=$'\t' read -r id name namespace state <<<"$row"
  if [[ -z "$id" || -z "$name" ]]; then
    echo "skipping malformed job row: $row" >&2
    continue
  fi

  echo "[streaming] restarting ${name} (${namespace}, state=${state})"
  curl_api -X POST "$(api_url "/api/streaming/jobs/${id}/restart")"
  echo

  if [[ "${WAIT_SECONDS}" != "0" ]]; then
    sleep "${WAIT_SECONDS}"
  fi
done

echo "[streaming] restart requests complete"
