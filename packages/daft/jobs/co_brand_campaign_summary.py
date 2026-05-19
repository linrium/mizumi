# /// script
# dependencies = ["daft[deltalake]"]
# ///
from __future__ import annotations

from collections import defaultdict

import daft
import deltalake
import pyarrow as pa
from daft.io import IOConfig, S3Config
from dagster_pipes import open_dagster_pipes

AUDIENCE_SOURCE_PATH = "s3://unitycatalog/partnership/co_brand_gold/co_brand_offer_audience_v1"
SUMMARY_TARGET_PATH = "s3://unitycatalog/partnership/co_brand_gold/campaign_summary_v1"

S3_STORAGE_OPTIONS = {
    "endpoint_url": "http://rustfs-svc.rustfs.svc.cluster.local:9000",
    "aws_access_key_id": "rustfsadmin",
    "aws_secret_access_key": "rustfsadmin",
    "aws_allow_http": "true",
    "allow_unsafe_rename": "true",
}

IO_CONFIG = IOConfig(
    s3=S3Config(
        endpoint_url="http://rustfs-svc.rustfs.svc.cluster.local:9000",
        key_id="rustfsadmin",
        access_key="rustfsadmin",
        use_ssl=False,
    )
)

SUMMARY_SCHEMA = pa.schema(
    [
        pa.field("campaign_name", pa.string(), nullable=False),
        pa.field("source_company", pa.string(), nullable=False),
        pa.field("target_company", pa.string(), nullable=False),
        pa.field("offer_name", pa.string(), nullable=False),
        pa.field("customer_count", pa.int64(), nullable=False),
        pa.field("avg_propensity_score", pa.float64(), nullable=False),
        pa.field("total_signal_value", pa.float64(), nullable=False),
    ]
)


def main() -> None:
    with open_dagster_pipes() as pipes:
        audience = daft.read_deltalake(AUDIENCE_SOURCE_PATH, io_config=IO_CONFIG)
        rows = audience.to_arrow().to_pylist()

        grouped: dict[tuple[str, str, str], dict[str, float]] = defaultdict(
            lambda: {"customer_count": 0, "propensity_total": 0.0, "signal_total": 0.0}
        )

        for row in rows:
            key = (row["source_company"], row["target_company"], row["offer_name"])
            grouped[key]["customer_count"] += 1
            grouped[key]["propensity_total"] += float(row["propensity_score"] or 0.0)
            grouped[key]["signal_total"] += float(row["signal_value"] or 0.0)

        summary_rows = []
        for key, metrics in sorted(grouped.items()):
            source_company, target_company, offer_name = key
            count = metrics["customer_count"]
            summary_rows.append(
                {
                    "campaign_name": f"{source_company}_to_{target_company}_{offer_name}",
                    "source_company": source_company,
                    "target_company": target_company,
                    "offer_name": offer_name,
                    "customer_count": count,
                    "avg_propensity_score": round(metrics["propensity_total"] / count, 2),
                    "total_signal_value": round(metrics["signal_total"], 2),
                }
            )

        arrow_table = pa.Table.from_pylist(summary_rows, schema=SUMMARY_SCHEMA)
        deltalake.write_deltalake(
            SUMMARY_TARGET_PATH,
            arrow_table,
            storage_options=S3_STORAGE_OPTIONS,
            mode="overwrite",
            schema_mode="overwrite",
        )

        pipes.report_asset_materialization(
            metadata={
                "row_count": len(summary_rows),
                "audience_rows": len(rows),
                "source": AUDIENCE_SOURCE_PATH,
                "target": SUMMARY_TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
