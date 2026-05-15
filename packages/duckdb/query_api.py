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


def debug_log(message: str, **fields: object) -> None:
    payload = {"message": message, **fields}
    print(json.dumps(payload, default=str), file=sys.stderr, flush=True)


def main() -> None:
    debug_log(
        "Starting DuckDB query API",
        uc_endpoint=UC_ENDPOINT,
        uc_token=UC_TOKEN,
        query=SQL,
    )

    if not SQL:
        print(json.dumps({"error": "DUCKDB_QUERY environment variable not set"}))
        sys.exit(1)

    if not UC_TOKEN:
        print(json.dumps({"error": "DUCKDB_UC_TOKEN environment variable not set"}))
        sys.exit(1)

    try:
        con = duckdb.connect()
        debug_log("Connected to DuckDB")

        debug_log("Loading DuckDB extensions", extensions=["httpfs", "delta", "unity_catalog"])
        con.execute("LOAD httpfs; LOAD delta; LOAD unity_catalog;")

        create_secret_sql = f"""
        CREATE SECRET (
            TYPE unity_catalog,
            TOKEN '{sql_quote(UC_TOKEN)}',
            ENDPOINT '{sql_quote(UC_ENDPOINT)}'
        )
        """
        debug_log("Creating Unity Catalog secret", sql=create_secret_sql)
        con.execute(create_secret_sql)

        hdbank_attach_sql = """
        ATTACH 'hdbank' AS hdbank (
            TYPE unity_catalog,
            DEFAULT_SCHEMA 'hdbank_payments_prod_bronze'
        )
        """
        debug_log("Attaching Unity Catalog catalog", catalog="hdbank", sql=hdbank_attach_sql)
        con.execute(hdbank_attach_sql)

        vietjetair_attach_sql = """
        ATTACH 'vietjetair' AS vietjetair (
            TYPE unity_catalog,
            DEFAULT_SCHEMA 'vietjetair_bookings_prod_bronze'
        )
        """
        debug_log(
            "Attaching Unity Catalog catalog",
            catalog="vietjetair",
            sql=vietjetair_attach_sql,
        )
        con.execute(vietjetair_attach_sql)

        debug_log("Executing query", sql=SQL)
        result = con.execute(SQL).fetchdf()
        debug_log(
            "Query execution finished",
            row_count=len(result),
            columns=list(result.columns),
        )

        output = {
            "columns": list(result.columns),
            "rows": result.values.tolist(),
            "row_count": len(result),
        }

        print(json.dumps(output, default=str))
    except Exception as exc:
        debug_log("Query execution failed", error=str(exc))
        raise


if __name__ == "__main__":
    main()
