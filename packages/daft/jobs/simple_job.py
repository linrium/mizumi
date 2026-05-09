# /// script
# dependencies = ["daft"]
# ///
import daft
from dagster_pipes import open_dagster_pipes


def main() -> None:
    with open_dagster_pipes() as pipes:
        df = daft.from_pydict(
            {
                "a": [3, 2, 5, 6, 1, 4],
                "b": [True, False, False, True, True, False],
            }
        )
        result = df.where(df["b"]).sort(df["a"]).to_pydict()
        row_count = len(result["a"])
        preview = [
            {"a": result["a"][idx], "b": result["b"][idx]}
            for idx in range(min(3, row_count))
        ]
        pipes.report_asset_materialization(
            metadata={
                "row_count": row_count,
                "preview": preview,
            }
        )


if __name__ == "__main__":
    main()
