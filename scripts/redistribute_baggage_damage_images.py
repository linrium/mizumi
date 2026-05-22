#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import random
import shutil
from pathlib import Path


IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".gif",
    ".tif",
    ".tiff",
    ".webp",
}

DEFAULT_CSV_PATH = Path("packages/spark/jobs/data/co_brand_customers.csv")
DEFAULT_SOURCE_DIR = Path("data/train")
DEFAULT_OUTPUT_DIR = Path("data/datasets/baggage_damaged")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Randomly distribute baggage damage images into folders named by "
            "vietjetair_customer_id."
        )
    )
    parser.add_argument(
        "--csv-path",
        type=Path,
        default=DEFAULT_CSV_PATH,
        help=f"Path to the customer CSV. Default: {DEFAULT_CSV_PATH}",
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help=f"Directory containing the source images. Default: {DEFAULT_SOURCE_DIR}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=(
            "Destination root for customer folders. "
            f"Default: {DEFAULT_OUTPUT_DIR}"
        ),
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used for reproducible assignments. Default: 42",
    )
    parser.add_argument(
        "--mode",
        choices=("copy", "move"),
        default="copy",
        help="Whether to copy or move images into customer folders. Default: copy",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned work without writing any files.",
    )
    return parser.parse_args()


def load_customer_ids(csv_path: Path) -> list[str]:
    with csv_path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if "vietjetair_customer_id" not in (reader.fieldnames or []):
            raise ValueError(
                f"Column 'vietjetair_customer_id' not found in {csv_path}"
            )

        customer_ids: list[str] = []
        seen: set[str] = set()
        for row in reader:
            customer_id = (row.get("vietjetair_customer_id") or "").strip()
            if not customer_id or customer_id in seen:
                continue
            seen.add(customer_id)
            customer_ids.append(customer_id)

    if not customer_ids:
        raise ValueError(f"No vietjetair_customer_id values found in {csv_path}")

    return customer_ids


def load_images(source_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in source_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def unique_destination_path(destination: Path) -> Path:
    if not destination.exists():
        return destination

    stem = destination.stem
    suffix = destination.suffix
    counter = 1
    while True:
        candidate = destination.with_name(f"{stem}_{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def redistribute_images(
    customer_ids: list[str],
    images: list[Path],
    output_dir: Path,
    mode: str,
    dry_run: bool,
    seed: int,
) -> tuple[int, int]:
    randomizer = random.Random(seed)
    written_count = 0
    touched_customers: set[str] = set()

    for image_path in images:
        customer_id = randomizer.choice(customer_ids)
        customer_dir = output_dir / customer_id
        destination = customer_dir / image_path.name

        if not dry_run:
            customer_dir.mkdir(parents=True, exist_ok=True)
            destination = unique_destination_path(destination)
            if mode == "copy":
                shutil.copy2(image_path, destination)
            else:
                shutil.move(str(image_path), str(destination))

        touched_customers.add(customer_id)
        written_count += 1

    return written_count, len(touched_customers)


def main() -> None:
    args = parse_args()

    if not args.csv_path.is_file():
        raise FileNotFoundError(f"CSV file not found: {args.csv_path}")
    if not args.source_dir.is_dir():
        raise FileNotFoundError(f"Source directory not found: {args.source_dir}")

    customer_ids = load_customer_ids(args.csv_path)
    images = load_images(args.source_dir)
    if not images:
        raise ValueError(f"No image files found in {args.source_dir}")

    written_count, touched_customer_count = redistribute_images(
        customer_ids=customer_ids,
        images=images,
        output_dir=args.output_dir,
        mode=args.mode,
        dry_run=args.dry_run,
        seed=args.seed,
    )

    print(f"Loaded {len(customer_ids)} unique customer IDs from {args.csv_path}")
    print(f"Found {len(images)} images in {args.source_dir}")
    print(f"Mode: {args.mode}")
    print(f"Dry run: {args.dry_run}")
    print(f"Seed: {args.seed}")
    print(f"Processed {written_count} images")
    print(f"Touched {touched_customer_count} customer folders")
    print(f"Output root: {args.output_dir}")


if __name__ == "__main__":
    main()
