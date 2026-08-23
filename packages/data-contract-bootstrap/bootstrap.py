#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise SystemExit(f"missing required environment variable: {name}")
    return value


UC_URL = env("UC_URL", "http://localhost:8082").rstrip("/")
CONTROLPLANE_URL = env("CONTROLPLANE_URL", "http://localhost:4000").rstrip("/")
UC_TOKEN = os.environ.get("UC_TOKEN", "")
UC_TOKEN_FILE = os.environ.get("UC_TOKEN_FILE", "")
CONTROLPLANE_TOKEN = env("CONTROLPLANE_TOKEN", "test")
CONTRACT_VERSION = int(env("CONTRACT_VERSION", "1"))
ACTIVATE_CONTRACTS = env("ACTIVATE_CONTRACTS", "true").lower() == "true"
CATALOG_FILTER = os.environ.get("CATALOG_FILTER", "")
SCHEMA_FILTER = os.environ.get("SCHEMA_FILTER", "")


if not UC_TOKEN and UC_TOKEN_FILE:
    with open(UC_TOKEN_FILE, "r", encoding="utf-8") as f:
        UC_TOKEN = f.read().strip()


def request(
    method: str,
    url: str,
    token: str | None = None,
    payload: dict | None = None,
    expected: tuple[int, ...] = (200,),
):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url,
        headers=headers,
        data=None if payload is None else json.dumps(payload).encode(),
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
            if resp.status not in expected:
                raise RuntimeError(f"{method} {url} returned {resp.status}: {body}")
            return json.loads(body) if body else None
    except urllib.error.HTTPError as err:
        body = err.read().decode()
        if err.code in expected:
            return {"_status": err.code, "_body": body}
        raise RuntimeError(f"{method} {url} failed: {err.code} {body}") from err


def wait_ready() -> None:
    readyz = f"{CONTROLPLANE_URL}/readyz"
    for attempt in range(1, 61):
        try:
            request("GET", readyz, expected=(200,))
            print("controlplane ready")
            return
        except Exception:
            print(f"waiting for controlplane ({attempt}/60)")
            time.sleep(2)
    raise SystemExit("controlplane never became ready")


def uc(path: str):
    return request("GET", f"{UC_URL}/api/2.1/unity-catalog{path}", UC_TOKEN or None)


def cp(method: str, path: str, payload: dict | None = None, expected: tuple[int, ...] = (200,)):
    return request(
        method,
        f"{CONTROLPLANE_URL}{path}",
        CONTROLPLANE_TOKEN,
        payload,
        expected,
    )


def names(response: dict, key: str) -> list[str]:
    return [item["name"] for item in response.get(key, [])]


def discover_tables() -> list[str]:
    tables: list[str] = []
    catalog_names = names(uc("/catalogs"), "catalogs")
    for catalog in catalog_names:
        if CATALOG_FILTER and catalog != CATALOG_FILTER:
            continue
        schemas = names(
            uc(f"/schemas?catalog_name={urllib.parse.quote(catalog)}&max_results=1000"),
            "schemas",
        )
        for schema in schemas:
            if SCHEMA_FILTER and schema != SCHEMA_FILTER:
                continue
            response = uc(
                "/tables?"
                + urllib.parse.urlencode(
                    {
                        "catalog_name": catalog,
                        "schema_name": schema,
                        "max_results": "1000",
                    }
                )
            )
            for table in response.get("tables", []):
                tables.append(f"{catalog}.{schema}.{table['name']}")
    return tables


def contract_path(full_name: str, suffix: str) -> str:
    catalog, schema, table = full_name.split(".", 2)
    namespace = urllib.parse.quote(f"{catalog}.{schema}", safe="")
    name = urllib.parse.quote(table, safe="")
    return f"/api/data-contracts/{namespace}/{name}/versions/{CONTRACT_VERSION}{suffix}"


def sync_table(full_name: str) -> None:
    print(f"syncing data contract for {full_name}")
    import_result = cp(
        "POST",
        "/api/data-contracts/import-from-uc",
        {"table": full_name, "version": CONTRACT_VERSION},
        expected=(201, 409),
    )
    if isinstance(import_result, dict) and import_result.get("_status") == 409:
        print(f"contract already exists for {full_name}@v{CONTRACT_VERSION}")

    validation = cp(
        "POST",
        contract_path(full_name, "/validate"),
        {"metadata_only": True},
    )
    if not validation.get("valid"):
        raise RuntimeError(f"contract validation failed for {full_name}: {validation}")

    if ACTIVATE_CONTRACTS:
        cp("POST", contract_path(full_name, "/activate"))
        print(f"activated contract for {full_name}@v{CONTRACT_VERSION}")


def main() -> int:
    wait_ready()
    tables = discover_tables()
    print(f"discovered {len(tables)} Unity Catalog tables")
    failures = []
    for table in tables:
        try:
            sync_table(table)
        except Exception as exc:
            failures.append((table, str(exc)))
            print(f"failed to sync {table}: {exc}", file=sys.stderr)

    if failures:
        print("data contract sync finished with failures", file=sys.stderr)
        for table, error in failures:
            print(f"- {table}: {error}", file=sys.stderr)
        return 1

    print("data contract sync complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
