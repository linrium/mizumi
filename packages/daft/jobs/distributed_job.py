import argparse

import daft
import ray
from dagster_pipes import open_dagster_pipes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ray-address", required=True)
    args = parser.parse_args()

    with open_dagster_pipes() as pipes:
        ray.init(args.ray_address, runtime_env={"pip": ["daft==0.7.10"]})
        daft.set_runner_ray(args.ray_address)

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
                "ray_address": args.ray_address,
            }
        )


if __name__ == "__main__":
    main()
