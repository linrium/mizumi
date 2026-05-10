import json
import os
import re
import sys
import urllib.error
import urllib.request

import duckdb

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
SQL = os.getenv("DUCKDB_QUERY", "")
UC_BASE_URL = os.getenv(
    "UC_BASE_URL",
    "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080/api/2.1/unity-catalog",
)

# Matches three-part identifiers: catalog.schema.table
_THREE_PART_RE = re.compile(
    r'\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b'
)


def _uc_table_location(full_name: str) -> str | None:
    url = f"{UC_BASE_URL}/tables/{full_name}"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
            return data.get("storage_location")
    except (urllib.error.HTTPError, urllib.error.URLError, Exception):
        return None


def resolve_uc_tables(sql: str) -> str:
    """Replace catalog.schema.table references with delta_scan(storage_location)."""
    cache: dict[str, str | None] = {}

    def replace(m: re.Match) -> str:
        full_name = m.group(0)
        if full_name not in cache:
            cache[full_name] = _uc_table_location(full_name)
        location = cache[full_name]
        return f"delta_scan('{location}')" if location else full_name

    return _THREE_PART_RE.sub(replace, sql)


def main() -> None:
    if not SQL:
        print(json.dumps({"error": "DUCKDB_QUERY environment variable not set"}))
        sys.exit(1)

    resolved_sql = resolve_uc_tables(SQL)

    con = duckdb.connect()
    con.execute("LOAD httpfs; LOAD delta;")

    endpoint_host = ENDPOINT.replace("http://", "").replace("https://", "")
    con.execute(f"""
        CREATE SECRET rustfs (
            TYPE S3,
            KEY_ID '{ACCESS_KEY}',
            SECRET '{SECRET_KEY}',
            ENDPOINT '{endpoint_host}',
            USE_SSL false,
            URL_STYLE 'path',
            REGION 'us-east-1'
        )
    """)

    result = con.execute(resolved_sql).fetchdf()

    output = {
        "columns": list(result.columns),
        "rows": result.values.tolist(),
        "row_count": len(result),
    }

    print(json.dumps(output, default=str))


if __name__ == "__main__":
    main()
