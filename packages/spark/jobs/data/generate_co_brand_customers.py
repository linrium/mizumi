from __future__ import annotations

import csv
import random
from pathlib import Path

TOTAL_CUSTOMERS_PER_COMPANY = 1000
SHARED_CUSTOMERS = 600
EXCLUSIVE_CUSTOMERS_PER_COMPANY = TOTAL_CUSTOMERS_PER_COMPANY - SHARED_CUSTOMERS

FIRST_NAMES = [
    "An",
    "Bao",
    "Binh",
    "Chi",
    "Dung",
    "Giang",
    "Hanh",
    "Hoa",
    "Khanh",
    "Lan",
    "Linh",
    "Minh",
    "Ngoc",
    "Phuc",
    "Quang",
    "Thao",
    "Trang",
    "Tuan",
    "Vy",
]
LAST_NAMES = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Huynh", "Phan", "Vu", "Dang", "Bui"]
CITIES = ["Ho Chi Minh City", "Ha Noi", "Da Nang", "Can Tho", "Hai Phong", "Nha Trang"]
HDBANK_SEGMENTS = ["AFFLUENT", "SALARY_PLUS", "EMERGING_AFFLUENT", "YOUNG_FAMILY"]
CHANNELS = ["APP", "SMS", "BRANCH"]
VJA_TIERS = ["SKYJOY_RED", "SKYJOY_GOLD", "SKYJOY_PLATINUM"]
AIRPORTS = ["SGN", "HAN", "DAD", "PQC", "CXR"]

OUTPUT_PATH = Path(__file__).with_name("co_brand_customers.csv")


def full_name(rng: random.Random) -> str:
    return f"{rng.choice(LAST_NAMES)} {rng.choice(FIRST_NAMES)}"


def base_row(unified_customer_id: str, rng: random.Random) -> dict[str, str]:
    return {
        "unified_customer_id": unified_customer_id,
        "full_name": full_name(rng),
        "city": rng.choice(CITIES),
        "age": str(rng.randint(22, 62)),
        "hdbank_segment": rng.choice(HDBANK_SEGMENTS),
        "preferred_channel": rng.choices(CHANNELS, weights=[0.65, 0.25, 0.10], k=1)[0],
        "monthly_income": f"{rng.randint(18, 120) * 1_000_000:.2f}",
        "credit_score": str(rng.randint(620, 840)),
        "has_credit_card": "true" if rng.random() < 0.76 else "false",
        "membership_tier": rng.choices(VJA_TIERS, weights=[0.58, 0.3, 0.12], k=1)[0],
        "home_airport": rng.choice(AIRPORTS),
        "email_opt_in": "true" if rng.random() < 0.84 else "false",
    }


def main() -> None:
    rng = random.Random(42)
    rows: list[dict[str, str]] = []

    for index in range(1, SHARED_CUSTOMERS + 1):
        row = base_row(f"U-{index:04d}", rng)
        row.update(
            {
                "hdbank_customer_id": f"CUS-{index:04d}",
                "vietjetair_customer_id": f"CUS-{index:04d}",
                "shared_customer": "true",
                "has_hdbank": "true",
                "has_vietjetair": "true",
            }
        )
        rows.append(row)

    for offset in range(1, EXCLUSIVE_CUSTOMERS_PER_COMPANY + 1):
        hdbank_index = SHARED_CUSTOMERS + offset
        hdbank_row = base_row(f"U-{hdbank_index:04d}", rng)
        hdbank_row.update(
            {
                "hdbank_customer_id": f"CUS-{hdbank_index:04d}",
                "vietjetair_customer_id": "",
                "shared_customer": "false",
                "has_hdbank": "true",
                "has_vietjetair": "false",
            }
        )
        rows.append(hdbank_row)

        vietjetair_index = TOTAL_CUSTOMERS_PER_COMPANY + offset
        vietjetair_row = base_row(f"U-{vietjetair_index:04d}", rng)
        vietjetair_row.update(
            {
                "hdbank_customer_id": "",
                "vietjetair_customer_id": f"CUS-{vietjetair_index:04d}",
                "shared_customer": "false",
                "has_hdbank": "false",
                "has_vietjetair": "true",
            }
        )
        rows.append(vietjetair_row)

    fieldnames = [
        "unified_customer_id",
        "full_name",
        "city",
        "age",
        "hdbank_customer_id",
        "vietjetair_customer_id",
        "hdbank_segment",
        "preferred_channel",
        "monthly_income",
        "credit_score",
        "has_credit_card",
        "membership_tier",
        "home_airport",
        "email_opt_in",
        "shared_customer",
        "has_hdbank",
        "has_vietjetair",
    ]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
