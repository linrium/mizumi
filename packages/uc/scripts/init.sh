#!/bin/sh
set -eu

UC_URL="${UC_URL:-http://unitycatalog-svc:8080}"
UC_TOKEN_FILE="${UC_TOKEN_FILE:-/token/uc-token}"

if [ ! -f "$UC_TOKEN_FILE" ]; then
  echo "missing UC token file: $UC_TOKEN_FILE" >&2
  exit 1
fi

UC_TOKEN="$(cat "$UC_TOKEN_FILE")"
export UC_URL UC_TOKEN

python3 <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

base_url = os.environ["UC_URL"].rstrip("/")
token = os.environ["UC_TOKEN"]


def request(method: str, path: str, payload: dict) -> None:
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            if body:
                print(body)
    except urllib.error.HTTPError as err:
        body = err.read().decode()
        if err.code == 409:
            print(f"already exists: {path}")
            return
        print(f"{method} {path} failed: {err.code} {body}", file=sys.stderr)
        raise


for display_name, email in [
    ("Linh Tran", "linh@gmail.com"),
    ("Khao Soi", "khaosoi@gmail.com"),
    ("Khao Pad", "khaopad@gmail.com"),
]:
    request(
        "POST",
        "/api/1.0/unity-control/scim2/Users",
        {
            "displayName": display_name,
            "emails": [{"value": email, "primary": True}],
        },
    )

request(
    "PATCH",
    "/api/2.1/unity-catalog/permissions/catalog/hdbank",
    {"changes": [{"principal": "linh@gmail.com", "add": ["USE_CATALOG"], "remove": []}]},
)

request(
    "PATCH",
    "/api/2.1/unity-catalog/permissions/schema/hdbank.hdbank_payments_prod_bronze",
    {"changes": [{"principal": "linh@gmail.com", "add": ["USE_SCHEMA"], "remove": []}]},
)

request(
    "PATCH",
    "/api/2.1/unity-catalog/permissions/table/hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1",
    {"changes": [{"principal": "linh@gmail.com", "add": ["SELECT"], "remove": []}]},
)
PY
