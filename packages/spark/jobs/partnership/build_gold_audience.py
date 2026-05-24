from __future__ import annotations

import sys
from pathlib import Path

from dagster_pipes import open_dagster_pipes
from pyspark.sql import functions as F

sys.path.append(str(Path(__file__).resolve().parents[1]))

from common import (
    HDBANK_GOLD_TARGET_PATH,
    PARTNERSHIP_GOLD_TARGET_PATH,
    VIETJETAIR_GOLD_TARGET_PATH,
    build_session,
    priority_band,
    write_delta,
)


def main() -> None:
    spark = build_session("partnership-build-gold-audience")

    hdbank_candidates = spark.read.format("delta").load(HDBANK_GOLD_TARGET_PATH)
    vietjet_candidates = spark.read.format("delta").load(VIETJETAIR_GOLD_TARGET_PATH)

    audience = (
        hdbank_candidates.withColumn("source_company", F.lit("hdbank"))
        .withColumn("target_company", F.lit("vietjetair"))
        .unionByName(
            vietjet_candidates.withColumn("source_company", F.lit("vietjetair")).withColumn(
                "target_company", F.lit("hdbank")
            )
        )
        .withColumn("priority_band", priority_band("propensity_score"))
    )

    write_delta(audience, PARTNERSHIP_GOLD_TARGET_PATH)

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="partnership_gold_co_brand_offer_audience",
            metadata={"row_count": audience.count(), "target": PARTNERSHIP_GOLD_TARGET_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
