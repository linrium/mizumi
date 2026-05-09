# /// script
# dependencies = ["daft", "ray[client]==2.46.0"]
# ///
import daft
import ray


def main() -> None:
    ray.init(runtime_env={"pip": ["daft"]})
    df = daft.from_pydict(
        {
            "a": [3, 2, 5, 6, 1, 4],
            "b": [True, False, False, True, True, False],
        }
    )
    print(df.where(df["b"]).sort(df["a"]).collect())


if __name__ == "__main__":
    main()
