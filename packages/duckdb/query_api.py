import json
import os
import sys

import duckdb

SQL = os.getenv("DUCKDB_QUERY", "")
UC_ENDPOINT = os.getenv(
    "DUCKDB_UC_ENDPOINT",
    "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080",
)
UC_TOKEN = os.getenv("DUCKDB_UC_TOKEN", "")


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    if not SQL:
        print(json.dumps({"error": "DUCKDB_QUERY environment variable not set"}))
        sys.exit(1)

    if not UC_TOKEN:
        print(json.dumps({"error": "DUCKDB_UC_TOKEN environment variable not set"}))
        sys.exit(1)

    con = duckdb.connect()
    con.execute("LOAD httpfs; LOAD delta; LOAD unity_catalog;")
    con.execute(
        f"""
        CREATE SECRET (
            TYPE unity_catalog,
            TOKEN '{sql_quote(UC_TOKEN)}',
            ENDPOINT '{sql_quote(UC_ENDPOINT)}'
        )
        """
    )
    con.execute(
        """
        ATTACH 'hdbank' AS hdbank (
            TYPE unity_catalog,
            DEFAULT_SCHEMA 'hdbank_payments_prod_bronze'
        )
        """
    )
    con.execute(
        """
        ATTACH 'vietjetair' AS vietjetair (
            TYPE unity_catalog,
            DEFAULT_SCHEMA 'vietjetair_bookings_prod_bronze'
        )
        """
    )

    result = con.execute(SQL).fetchdf()

    output = {
        "columns": list(result.columns),
        "rows": result.values.tolist(),
        "row_count": len(result),
    }

    print(json.dumps(output, default=str))


if __name__ == "__main__":
    main()
