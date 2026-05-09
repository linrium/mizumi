import json
import os
import sys

import duckdb

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
SQL = os.getenv("DUCKDB_QUERY", "")


def main() -> None:
    if not SQL:
        print(json.dumps({"error": "DUCKDB_QUERY environment variable not set"}))
        sys.exit(1)

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

    result = con.execute(SQL).fetchdf()

    output = {
        "columns": list(result.columns),
        "rows": result.values.tolist(),
        "row_count": len(result),
    }

    print(json.dumps(output, default=str))


if __name__ == "__main__":
    main()
