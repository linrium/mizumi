"""
Sandbox seed-data generator.

Generates synthetic but realistic data for three catalogs:
  - hdbank_sandbox      (banking: payments, loans, BNPL, credit-risk features)
  - vietjetair_sandbox  (aviation: bookings, ancillary, route performance)
  - partnership_sandbox (cross-company: BNPL decisions, cross-sell prospects, customer 360)

Writes each table as Delta (primary) + CSV sidecar under a /csv/ prefix.
Paths follow the same convention as prod: s3a://unitycatalog/<catalog>/<schema>/<table>
"""

import random
import uuid
from datetime import date, datetime, timedelta

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    BooleanType,
    DateType,
    DoubleType,
    IntegerType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

# ── Config ──────────────────────────────────────────────────────────────────

SEED = 42
N_CUSTOMERS = 500
N_DAYS = 30
BASE_DATE = date(2025, 4, 1)
S3_BASE = "s3a://unitycatalog"

ROUTES = ["SGN-HAN", "HAN-SGN", "SGN-DAD", "DAD-SGN", "HAN-DAD", "DAD-HAN",
          "SGN-CXR", "CXR-SGN", "HAN-VCA", "VCA-HAN"]
AIRPORTS = ["SGN", "HAN", "DAD", "CXR", "VCA", "HPH", "PQC", "BMV"]
ANCILLARY_TYPES = ["baggage_20kg", "baggage_30kg", "hot_meal", "cold_snack",
                   "priority_boarding", "extra_legroom_seat", "sports_equipment"]
MERCHANT_CATEGORIES = ["airline", "supermarket", "restaurant", "fuel", "pharmacy",
                       "electronics", "hotel", "ride_hailing", "utility", "education"]
RISK_LABELS = ["low_risk", "medium_risk", "high_risk", "fraud_suspected"]
LOAN_TYPES = ["personal_loan", "bnpl_flight", "credit_limit_increase", "travel_loan"]
LOAN_STATUSES = ["approved", "declined", "pending", "cancelled"]
LOYALTY_TIERS = ["SkyFun", "SkyJoy", "SkyPlatinum"]
SEGMENTS = ["frequent_flyer", "occasional_traveler", "budget_shopper",
            "premium_spender", "new_customer"]

VN_SURNAMES = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Phan", "Vu", "Dang", "Bui", "Do"]
VN_GIVEN = ["Minh", "Anh", "Linh", "Hoa", "Nam", "Tuan", "Lan", "Duc", "Thu", "Hung",
             "Mai", "Thi", "Van", "Quang", "Dung", "Hieu", "Trang", "Long", "Yen", "Khanh"]


def rng(seed=SEED) -> random.Random:
    return random.Random(seed)


def uid() -> str:
    return str(uuid.uuid4())


def vn_name(r: random.Random) -> str:
    return f"{r.choice(VN_SURNAMES)} {r.choice(VN_GIVEN)} {r.choice(VN_GIVEN)}"


def ts(d: date, r: random.Random) -> datetime:
    return datetime(d.year, d.month, d.day,
                    r.randint(0, 23), r.randint(0, 59), r.randint(0, 59))


# ── Spark session ────────────────────────────────────────────────────────────

def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("sandbox-seed-data-generator")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog",
                "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .getOrCreate()
    )


# ── Write helper ─────────────────────────────────────────────────────────────

def write(spark: SparkSession, rows: list[dict], schema: StructType,
          catalog: str, schema_name: str, table: str) -> int:
    df = spark.createDataFrame(rows, schema)
    base = f"{S3_BASE}/{catalog}/{schema_name}/{table}"
    df.write.format("delta").mode("overwrite").save(base)
    df.write.mode("overwrite").option("header", "true").csv(f"{base}/csv")
    return df.count()


# ── Shared customer IDs (same person appears in both banks/airlines) ──────────

def make_shared_customers(r: random.Random):
    customers = []
    for _ in range(N_CUSTOMERS):
        customers.append({
            "hdbank_id": uid(),
            "vietjet_id": uid(),
            "name": vn_name(r),
            "email": None,
            "segment": r.choice(SEGMENTS),
            "loyalty_tier": r.choice(LOYALTY_TIERS),
        })
    for c in customers:
        local = c["name"].lower().replace(" ", ".") + str(r.randint(1, 99))
        c["email"] = f"{local}@gmail.com"
    return customers


# ════════════════════════════════════════════════════════════════════════════
# HDBank Sandbox
# ════════════════════════════════════════════════════════════════════════════

def seed_hdbank_bronze(spark, customers, r):
    cat = "hdbank_sandbox"
    schema = "hdbank_payments_sandbox_bronze"

    # raw_card_payment_events_v1
    raw_pay = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(80, 150)):
            c = r.choice(customers)
            raw_pay.append({
                "timestamp": ts(day, r),
                "key": c["hdbank_id"],
                "value": f'{{"customer_id":"{c["hdbank_id"]}","amount":{round(r.uniform(20000, 5000000), 0)},"currency":"VND","merchant_category":"{r.choice(MERCHANT_CATEGORIES)}","merchant_name":"merchant_{r.randint(1,200)}","note":"txn_{uid()[:8]}"}}'
            })
    pay_schema = StructType([
        StructField("timestamp", TimestampType()),
        StructField("key", StringType()),
        StructField("value", StringType()),
    ])
    write(spark, raw_pay, pay_schema, cat, schema, "raw_card_payment_events_v1")

    # raw_loan_application_events_v1
    raw_loans = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(5, 20)):
            c = r.choice(customers)
            raw_loans.append({
                "timestamp": ts(day, r),
                "key": c["hdbank_id"],
                "value": f'{{"customer_id":"{c["hdbank_id"]}","loan_type":"{r.choice(LOAN_TYPES)}","requested_amount":{round(r.uniform(1000000, 200000000), 0)},"vietjet_booking_ref":"{uid()[:12]}"}}'
            })
    write(spark, raw_loans, pay_schema, cat, schema, "raw_loan_application_events_v1")

    print(f"  {cat}.{schema}: bronze tables seeded ({len(raw_pay)} payment events, {len(raw_loans)} loan events)")


def seed_hdbank_silver(spark, customers, r):
    cat = "hdbank_sandbox"
    schema = "hdbank_payments_sandbox_silver"

    # card_payment_events_v1
    payments = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(80, 150)):
            c = r.choice(customers)
            payments.append({
                "payment_event_id": uid(),
                "customer_id": c["hdbank_id"],
                "account_id": f"ACC-{r.randint(100000, 999999)}",
                "transaction_reference": f"TXN-{uid()[:10].upper()}",
                "merchant_name": f"merchant_{r.randint(1, 200)}",
                "merchant_category": r.choice(MERCHANT_CATEGORIES),
                "amount": round(r.uniform(20000, 5000000), 0),
                "currency": "VND",
                "payment_timestamp": ts(day, r),
                "note": f"note_{uid()[:6]}",
            })
    pay_schema = StructType([
        StructField("payment_event_id", StringType()),
        StructField("customer_id", StringType()),
        StructField("account_id", StringType()),
        StructField("transaction_reference", StringType()),
        StructField("merchant_name", StringType()),
        StructField("merchant_category", StringType()),
        StructField("amount", DoubleType()),
        StructField("currency", StringType()),
        StructField("payment_timestamp", TimestampType()),
        StructField("note", StringType()),
    ])
    write(spark, payments, pay_schema, cat, schema, "card_payment_events_v1")

    # customers_v1
    cust_rows = [{
        "customer_id": c["hdbank_id"],
        "customer_name": c["name"],
        "segment_name": c["segment"],
        "kyc_status": r.choice(["verified", "pending", "rejected"]),
        "preferred_channel": r.choice(["mobile_app", "internet_banking", "branch", "atm"]),
        "updated_at": ts(BASE_DATE + timedelta(days=N_DAYS - 1), r),
    } for c in customers]
    cust_schema = StructType([
        StructField("customer_id", StringType()),
        StructField("customer_name", StringType()),
        StructField("segment_name", StringType()),
        StructField("kyc_status", StringType()),
        StructField("preferred_channel", StringType()),
        StructField("updated_at", TimestampType()),
    ])
    write(spark, cust_rows, cust_schema, cat, schema, "customers_v1")

    # loan_applications_v1
    loans = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(5, 20)):
            c = r.choice(customers)
            loans.append({
                "loan_application_id": uid(),
                "customer_id": c["hdbank_id"],
                "loan_type": r.choice(LOAN_TYPES),
                "requested_amount_vnd": round(r.uniform(1_000_000, 200_000_000), 0),
                "vietjet_booking_reference": uid()[:12],
                "kyc_score": round(r.uniform(300, 850), 1),
                "status": r.choice(LOAN_STATUSES),
                "applied_at": ts(day, r),
            })
    loan_schema = StructType([
        StructField("loan_application_id", StringType()),
        StructField("customer_id", StringType()),
        StructField("loan_type", StringType()),
        StructField("requested_amount_vnd", DoubleType()),
        StructField("vietjet_booking_reference", StringType()),
        StructField("kyc_score", DoubleType()),
        StructField("status", StringType()),
        StructField("applied_at", TimestampType()),
    ])
    write(spark, loans, loan_schema, cat, schema, "loan_applications_v1")

    print(f"  {cat}.{schema}: silver tables seeded ({len(payments)} payments, {len(cust_rows)} customers, {len(loans)} loans)")
    return payments


def seed_hdbank_gold(spark, customers, payments_raw, r):
    cat = "hdbank_sandbox"
    schema = "hdbank_payments_sandbox_gold"

    # user_spend_v1
    spend_map: dict[tuple, dict] = {}
    for p in payments_raw:
        day = p["payment_timestamp"].date()
        key = (day, p["customer_id"])
        if key not in spend_map:
            spend_map[key] = {"count": 0, "total": 0.0, "cats": []}
        spend_map[key]["count"] += 1
        spend_map[key]["total"] += p["amount"]
        spend_map[key]["cats"].append(p["merchant_category"])

    spend_rows = []
    for (day, cid), v in spend_map.items():
        top_cat = max(set(v["cats"]), key=v["cats"].count)
        spend_rows.append({
            "business_date": day,
            "customer_id": cid,
            "account_id": f"ACC-{abs(hash(cid)) % 900000 + 100000}",
            "transaction_count": v["count"],
            "total_spend": round(v["total"], 2),
            "avg_ticket_size": round(v["total"] / v["count"], 2),
            "top_merchant_category": top_cat,
            "currency": "VND",
        })
    spend_schema = StructType([
        StructField("business_date", DateType()),
        StructField("customer_id", StringType()),
        StructField("account_id", StringType()),
        StructField("transaction_count", IntegerType()),
        StructField("total_spend", DoubleType()),
        StructField("avg_ticket_size", DoubleType()),
        StructField("top_merchant_category", StringType()),
        StructField("currency", StringType()),
    ])
    write(spark, spend_rows, spend_schema, cat, schema, "user_spend_v1")

    # bnpl_exposure_v1
    bnpl_rows = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for c in r.sample(customers, k=min(50, len(customers))):
            active = r.randint(0, 4)
            if active == 0:
                continue
            outstanding = round(r.uniform(500_000, 30_000_000), 0)
            bnpl_rows.append({
                "business_date": day,
                "customer_id": c["hdbank_id"],
                "active_bnpl_count": active,
                "total_outstanding_vnd": outstanding,
                "avg_ticket_vnd": round(outstanding / active, 0),
                "currency": "VND",
            })
    bnpl_schema = StructType([
        StructField("business_date", DateType()),
        StructField("customer_id", StringType()),
        StructField("active_bnpl_count", IntegerType()),
        StructField("total_outstanding_vnd", DoubleType()),
        StructField("avg_ticket_vnd", DoubleType()),
        StructField("currency", StringType()),
    ])
    write(spark, bnpl_rows, bnpl_schema, cat, schema, "bnpl_exposure_v1")

    # credit_risk_features_v1  (cross-company: uses travel_frequency_score)
    snapshot = BASE_DATE + timedelta(days=N_DAYS - 1)
    risk_rows = [{
        "snapshot_date": snapshot,
        "customer_id": c["hdbank_id"],
        "avg_monthly_spend": round(r.uniform(500_000, 50_000_000), 0),
        "num_transactions_90d": r.randint(5, 200),
        "num_declined_90d": r.randint(0, 10),
        "travel_frequency_score": round(r.uniform(0.0, 1.0), 4),
        "top_merchant_category": r.choice(MERCHANT_CATEGORIES),
        "credit_utilization_pct": round(r.uniform(0.0, 1.0), 4),
    } for c in customers]
    risk_schema = StructType([
        StructField("snapshot_date", DateType()),
        StructField("customer_id", StringType()),
        StructField("avg_monthly_spend", DoubleType()),
        StructField("num_transactions_90d", IntegerType()),
        StructField("num_declined_90d", IntegerType()),
        StructField("travel_frequency_score", DoubleType()),
        StructField("top_merchant_category", StringType()),
        StructField("credit_utilization_pct", DoubleType()),
    ])
    write(spark, risk_rows, risk_schema, cat, schema, "credit_risk_features_v1")

    print(f"  {cat}.{schema}: gold tables seeded ({len(spend_rows)} spend rows, {len(bnpl_rows)} bnpl rows, {len(risk_rows)} risk rows)")


# ════════════════════════════════════════════════════════════════════════════
# VietJet Air Sandbox
# ════════════════════════════════════════════════════════════════════════════

def seed_vietjetair_bronze(spark, customers, r):
    cat = "vietjetair_sandbox"
    schema = "vietjetair_bookings_sandbox_bronze"
    raw_schema = StructType([
        StructField("timestamp", TimestampType()),
        StructField("key", StringType()),
        StructField("value", StringType()),
    ])

    # raw_booking_events_v1
    raw_bookings = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(40, 100)):
            c = r.choice(customers)
            route = r.choice(ROUTES)
            raw_bookings.append({
                "timestamp": ts(day, r),
                "key": uid(),
                "value": f'{{"customer_id":"{c["vietjet_id"]}","route_code":"{route}","ticket_amount":{round(r.uniform(299000, 3500000), 0)},"currency":"VND","pnr":"{uid()[:6].upper()}"}}'
            })
    write(spark, raw_bookings, raw_schema, cat, schema, "raw_booking_events_v1")

    # raw_ancillary_events_v1
    raw_ancillary = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(20, 60)):
            c = r.choice(customers)
            atype = r.choice(ANCILLARY_TYPES)
            raw_ancillary.append({
                "timestamp": ts(day, r),
                "key": uid(),
                "value": f'{{"customer_id":"{c["vietjet_id"]}","booking_id":"{uid()[:12]}","ancillary_type":"{atype}","amount":{round(r.uniform(50000, 800000), 0)},"currency":"VND"}}'
            })
    write(spark, raw_ancillary, raw_schema, cat, schema, "raw_ancillary_events_v1")

    print(f"  {cat}.{schema}: bronze tables seeded ({len(raw_bookings)} booking events, {len(raw_ancillary)} ancillary events)")


def seed_vietjetair_silver(spark, customers, r):
    cat = "vietjetair_sandbox"
    schema = "vietjetair_bookings_sandbox_silver"

    # ticket_bookings_v1
    bookings = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(40, 100)):
            c = r.choice(customers)
            bookings.append({
                "booking_id": uid(),
                "customer_id": c["vietjet_id"],
                "pnr_code": uid()[:6].upper(),
                "payment_reference": f"PAY-{uid()[:10].upper()}",
                "route_code": r.choice(ROUTES),
                "ticket_amount": round(r.uniform(299_000, 3_500_000), 0),
                "currency": "VND",
                "booking_timestamp": ts(day, r),
            })
    book_schema = StructType([
        StructField("booking_id", StringType()),
        StructField("customer_id", StringType()),
        StructField("pnr_code", StringType()),
        StructField("payment_reference", StringType()),
        StructField("route_code", StringType()),
        StructField("ticket_amount", DoubleType()),
        StructField("currency", StringType()),
        StructField("booking_timestamp", TimestampType()),
    ])
    write(spark, bookings, book_schema, cat, schema, "ticket_bookings_v1")

    # customers_v1
    vj_customers = [{
        "customer_id": c["vietjet_id"],
        "customer_name": c["name"],
        "membership_tier": c["loyalty_tier"],
        "home_airport": r.choice(AIRPORTS),
        "email_opt_in": r.choice([True, False]),
        "updated_at": ts(BASE_DATE + timedelta(days=N_DAYS - 1), r),
    } for c in customers]
    vj_cust_schema = StructType([
        StructField("customer_id", StringType()),
        StructField("customer_name", StringType()),
        StructField("membership_tier", StringType()),
        StructField("home_airport", StringType()),
        StructField("email_opt_in", BooleanType()),
        StructField("updated_at", TimestampType()),
    ])
    write(spark, vj_customers, vj_cust_schema, cat, schema, "customers_v1")

    # flights_v1
    flights = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(10, 25)):
            route = r.choice(ROUTES)
            orig, dest = route.split("-")
            flights.append({
                "flight_id": uid(),
                "flight_number": f"VJ{r.randint(100, 999)}",
                "route_code": route,
                "departure_airport": orig,
                "arrival_airport": dest,
                "scheduled_departure_time": ts(day, r),
                "aircraft_type": r.choice(["A320", "A321", "A320neo", "A321neo"]),
            })
    flight_schema = StructType([
        StructField("flight_id", StringType()),
        StructField("flight_number", StringType()),
        StructField("route_code", StringType()),
        StructField("departure_airport", StringType()),
        StructField("arrival_airport", StringType()),
        StructField("scheduled_departure_time", TimestampType()),
        StructField("aircraft_type", StringType()),
    ])
    write(spark, flights, flight_schema, cat, schema, "flights_v1")

    # ancillary_purchases_v1
    ancillary = []
    for d_offset in range(N_DAYS):
        day = BASE_DATE + timedelta(days=d_offset)
        for _ in range(r.randint(20, 60)):
            c = r.choice(customers)
            atype = r.choice(ANCILLARY_TYPES)
            ancillary.append({
                "ancillary_id": uid(),
                "booking_id": uid(),
                "customer_id": c["vietjet_id"],
                "ancillary_type": atype,
                "item_name": atype.replace("_", " ").title(),
                "amount": round(r.uniform(50_000, 800_000), 0),
                "currency": "VND",
                "purchased_at": ts(day, r),
            })
    anc_schema = StructType([
        StructField("ancillary_id", StringType()),
        StructField("booking_id", StringType()),
        StructField("customer_id", StringType()),
        StructField("ancillary_type", StringType()),
        StructField("item_name", StringType()),
        StructField("amount", DoubleType()),
        StructField("currency", StringType()),
        StructField("purchased_at", TimestampType()),
    ])
    write(spark, ancillary, anc_schema, cat, schema, "ancillary_purchases_v1")

    print(f"  {cat}.{schema}: silver tables seeded ({len(bookings)} bookings, {len(vj_customers)} customers, {len(flights)} flights, {len(ancillary)} ancillary)")
    return bookings, ancillary


def seed_vietjetair_gold(spark, bookings, ancillary, r):
    cat = "vietjetair_sandbox"
    schema = "vietjetair_bookings_sandbox_gold"

    # booking_revenue_v1  (aggregated from silver bookings)
    rev_map: dict[tuple, dict] = {}
    for b in bookings:
        day = b["booking_timestamp"].date()
        key = (day, b["route_code"])
        if key not in rev_map:
            rev_map[key] = {"count": 0, "revenue": 0.0}
        rev_map[key]["count"] += 1
        rev_map[key]["revenue"] += b["ticket_amount"]

    ANCILLARY_RATE = 0.12
    brev_rows = []
    for (day, route), v in rev_map.items():
        ticket_rev = round(v["revenue"], 2)
        brev_rows.append({
            "business_date": day,
            "route_code": route,
            "booking_count": v["count"],
            "ticket_revenue": ticket_rev,
            "ancillary_revenue": round(ticket_rev * ANCILLARY_RATE, 2),
            "currency": "VND",
        })
    brev_schema = StructType([
        StructField("business_date", DateType()),
        StructField("route_code", StringType()),
        StructField("booking_count", IntegerType()),
        StructField("ticket_revenue", DoubleType()),
        StructField("ancillary_revenue", DoubleType()),
        StructField("currency", StringType()),
    ])
    write(spark, brev_rows, brev_schema, cat, schema, "booking_revenue_v1")

    # customer_spend_v1
    cspend_map: dict[tuple, dict] = {}
    for b in bookings:
        day = b["booking_timestamp"].date()
        key = (day, b["customer_id"])
        if key not in cspend_map:
            cspend_map[key] = {"count": 0, "total": 0.0, "routes": []}
        cspend_map[key]["count"] += 1
        cspend_map[key]["total"] += b["ticket_amount"]
        cspend_map[key]["routes"].append(b["route_code"])

    cspend_rows = []
    for (day, cid), v in cspend_map.items():
        top_route = max(set(v["routes"]), key=v["routes"].count)
        cspend_rows.append({
            "business_date": day,
            "customer_id": cid,
            "booking_count": v["count"],
            "total_ticket_spend": round(v["total"], 2),
            "avg_booking_value": round(v["total"] / v["count"], 2),
            "favorite_route_code": top_route,
            "currency": "VND",
        })
    cspend_schema = StructType([
        StructField("business_date", DateType()),
        StructField("customer_id", StringType()),
        StructField("booking_count", IntegerType()),
        StructField("total_ticket_spend", DoubleType()),
        StructField("avg_booking_value", DoubleType()),
        StructField("favorite_route_code", StringType()),
        StructField("currency", StringType()),
    ])
    write(spark, cspend_rows, cspend_schema, cat, schema, "customer_spend_v1")

    # ancillary_revenue_v1
    arev_map: dict[tuple, dict] = {}
    for a in ancillary:
        day = a["purchased_at"].date()
        route = r.choice(ROUTES)
        key = (day, route, a["ancillary_type"])
        if key not in arev_map:
            arev_map[key] = {"count": 0, "total": 0.0}
        arev_map[key]["count"] += 1
        arev_map[key]["total"] += a["amount"]

    arev_rows = []
    for (day, route, atype), v in arev_map.items():
        arev_rows.append({
            "business_date": day,
            "route_code": route,
            "ancillary_type": atype,
            "purchase_count": v["count"],
            "total_revenue": round(v["total"], 2),
            "avg_item_price": round(v["total"] / v["count"], 2),
            "currency": "VND",
        })
    arev_schema = StructType([
        StructField("business_date", DateType()),
        StructField("route_code", StringType()),
        StructField("ancillary_type", StringType()),
        StructField("purchase_count", IntegerType()),
        StructField("total_revenue", DoubleType()),
        StructField("avg_item_price", DoubleType()),
        StructField("currency", StringType()),
    ])
    write(spark, arev_rows, arev_schema, cat, schema, "ancillary_revenue_v1")

    # route_performance_v1
    route_days: dict[tuple, list] = {}
    for b in bookings:
        day = b["booking_timestamp"].date()
        key = (day, b["route_code"])
        route_days.setdefault(key, []).append(b["ticket_amount"])

    rperf_rows = []
    for (day, route), amounts in route_days.items():
        rperf_rows.append({
            "flight_date": day,
            "route_code": route,
            "scheduled_flights": r.randint(2, 8),
            "avg_load_factor": round(r.uniform(0.55, 0.97), 4),
            "avg_ticket_price": round(sum(amounts) / len(amounts), 2),
            "on_time_rate": round(r.uniform(0.70, 0.99), 4),
            "currency": "VND",
        })
    rperf_schema = StructType([
        StructField("flight_date", DateType()),
        StructField("route_code", StringType()),
        StructField("scheduled_flights", IntegerType()),
        StructField("avg_load_factor", DoubleType()),
        StructField("avg_ticket_price", DoubleType()),
        StructField("on_time_rate", DoubleType()),
        StructField("currency", StringType()),
    ])
    write(spark, rperf_rows, rperf_schema, cat, schema, "route_performance_v1")

    print(f"  {cat}.{schema}: gold tables seeded ({len(brev_rows)} rev rows, {len(cspend_rows)} spend rows, {len(arev_rows)} ancillary rev rows, {len(rperf_rows)} route perf rows)")


# ════════════════════════════════════════════════════════════════════════════
# Partnership Sandbox
# ════════════════════════════════════════════════════════════════════════════

def seed_partnership_credit_risk(spark, customers, bookings, r):
    cat = "partnership_sandbox"
    schema = "credit_risk"

    # travel_credit_features_v1 — combines HDBank customer ID with VietJet travel behavior
    booking_counts: dict[str, int] = {}
    booking_totals: dict[str, float] = {}
    booking_routes: dict[str, list] = {}
    for b in bookings:
        cid = b["customer_id"]
        booking_counts[cid] = booking_counts.get(cid, 0) + 1
        booking_totals[cid] = booking_totals.get(cid, 0.0) + b["ticket_amount"]
        booking_routes.setdefault(cid, []).append(b["route_code"])

    feature_rows = []
    snapshot = BASE_DATE + timedelta(days=N_DAYS - 1)
    for c in customers:
        vj_id = c["vietjet_id"]
        cnt = booking_counts.get(vj_id, 0)
        total = booking_totals.get(vj_id, 0.0)
        routes = booking_routes.get(vj_id, [])
        feature_rows.append({
            "feature_date": snapshot,
            "hdbank_customer_id": c["hdbank_id"],
            "vietjet_customer_id": vj_id,
            "travel_frequency_score": round(min(cnt / 10.0, 1.0), 4),
            "avg_booking_value": round(total / cnt, 2) if cnt else 0.0,
            "loyalty_tier": c["loyalty_tier"],
            "distinct_routes_count": len(set(routes)),
            "ancillary_spend_ratio": round(r.uniform(0.05, 0.35), 4),
        })
    feat_schema = StructType([
        StructField("feature_date", DateType()),
        StructField("hdbank_customer_id", StringType()),
        StructField("vietjet_customer_id", StringType()),
        StructField("travel_frequency_score", DoubleType()),
        StructField("avg_booking_value", DoubleType()),
        StructField("loyalty_tier", StringType()),
        StructField("distinct_routes_count", IntegerType()),
        StructField("ancillary_spend_ratio", DoubleType()),
    ])
    write(spark, feature_rows, feat_schema, cat, schema, "travel_credit_features_v1")

    # bnpl_decisions_v1 — HDBank BNPL approvals for VietJet bookings
    bnpl_rows = []
    for b in r.sample(bookings, k=min(800, len(bookings))):
        c = next((x for x in customers if x["vietjet_id"] == b["customer_id"]), None)
        if c is None:
            continue
        approved = r.random() > 0.25
        bnpl_rows.append({
            "decision_id": uid(),
            "booking_id": b["booking_id"],
            "vietjet_customer_id": b["customer_id"],
            "hdbank_customer_id": c["hdbank_id"],
            "booking_amount": b["ticket_amount"],
            "approved_credit_line": round(b["ticket_amount"] * r.uniform(1.2, 3.0), 0) if approved else 0.0,
            "bnpl_term_months": r.choice([3, 6, 12]) if approved else 0,
            "interest_rate_bps": r.choice([0, 99, 149, 199]) if approved else 0,
            "decision": "approved" if approved else "declined",
            "decided_at": b["booking_timestamp"],
        })
    bnpl_schema = StructType([
        StructField("decision_id", StringType()),
        StructField("booking_id", StringType()),
        StructField("vietjet_customer_id", StringType()),
        StructField("hdbank_customer_id", StringType()),
        StructField("booking_amount", DoubleType()),
        StructField("approved_credit_line", DoubleType()),
        StructField("bnpl_term_months", IntegerType()),
        StructField("interest_rate_bps", IntegerType()),
        StructField("decision", StringType()),
        StructField("decided_at", TimestampType()),
    ])
    write(spark, bnpl_rows, bnpl_schema, cat, schema, "bnpl_decisions_v1")

    # loan_decision_log_v1
    loan_rows = []
    snapshot = BASE_DATE + timedelta(days=N_DAYS - 1)
    for _ in range(400):
        c = r.choice(customers)
        pd_score = round(r.uniform(0.01, 0.45), 4)
        approved = pd_score < 0.20
        loan_rows.append({
            "decision_id": uid(),
            "customer_id": c["hdbank_id"],
            "loan_type": r.choice(LOAN_TYPES),
            "features_snapshot_date": snapshot,
            "model_version": f"credit-risk-v{r.choice(['1.0', '1.1', '2.0'])}",
            "probability_default": pd_score,
            "decision": "approved" if approved else "declined",
            "credit_limit_vnd": round(r.uniform(5_000_000, 200_000_000), 0) if approved else 0.0,
            "decided_at": ts(BASE_DATE + timedelta(days=r.randint(0, N_DAYS - 1)), r),
        })
    loan_schema = StructType([
        StructField("decision_id", StringType()),
        StructField("customer_id", StringType()),
        StructField("loan_type", StringType()),
        StructField("features_snapshot_date", DateType()),
        StructField("model_version", StringType()),
        StructField("probability_default", DoubleType()),
        StructField("decision", StringType()),
        StructField("credit_limit_vnd", DoubleType()),
        StructField("decided_at", TimestampType()),
    ])
    write(spark, loan_rows, loan_schema, cat, schema, "loan_decision_log_v1")

    print(f"  {cat}.{schema}: credit risk tables seeded ({len(feature_rows)} features, {len(bnpl_rows)} bnpl decisions, {len(loan_rows)} loan decisions)")


def seed_partnership_cross_promotion(spark, customers, bookings, r):
    cat = "partnership_sandbox"
    schema = "cross_promotion"

    hd_products = ["VietJet HDBank Travel Card", "VietJet Platinum Card", "Miles Savings Account"]
    vj_products = ["SkyFun Membership", "SkyJoy Upgrade", "SkyPlatinum Fast-Track"]

    # vietjet_to_hdbank_prospects_v1 — VietJet flyers targeted for HDBank cards
    vj_to_hd = []
    for c in r.sample(customers, k=min(300, len(customers))):
        flight_spend = sum(b["ticket_amount"] for b in bookings if b["customer_id"] == c["vietjet_id"])
        if flight_spend < 1_000_000:
            continue
        vj_to_hd.append({
            "prospect_id": uid(),
            "vietjet_customer_id": c["vietjet_id"],
            "customer_name": c["name"],
            "home_airport": r.choice(AIRPORTS),
            "membership_tier": c["loyalty_tier"],
            "annual_flight_spend_vnd": round(flight_spend * (365 / N_DAYS), 0),
            "recommended_product": r.choice(hd_products),
            "propensity_score": round(r.uniform(0.4, 0.95), 4),
            "campaign_id": f"CAM-VJ2HD-{r.randint(1, 5):03d}",
        })
    vj_to_hd_schema = StructType([
        StructField("prospect_id", StringType()),
        StructField("vietjet_customer_id", StringType()),
        StructField("customer_name", StringType()),
        StructField("home_airport", StringType()),
        StructField("membership_tier", StringType()),
        StructField("annual_flight_spend_vnd", DoubleType()),
        StructField("recommended_product", StringType()),
        StructField("propensity_score", DoubleType()),
        StructField("campaign_id", StringType()),
    ])
    write(spark, vj_to_hd, vj_to_hd_schema, cat, schema, "vietjet_to_hdbank_prospects_v1")

    # hdbank_to_vietjet_prospects_v1 — HDBank users targeted for VietJet membership
    hd_to_vj = []
    for c in r.sample(customers, k=min(300, len(customers))):
        travel_share = round(r.uniform(0.05, 0.60), 4)
        hd_to_vj.append({
            "prospect_id": uid(),
            "hdbank_customer_id": c["hdbank_id"],
            "customer_name": c["name"],
            "travel_spend_share": travel_share,
            "top_airline_merchant": r.choice(["VietJet Air", "Vietnam Airlines", "Bamboo Airways"]),
            "recommended_tier": r.choice(vj_products),
            "propensity_score": round(r.uniform(0.35, 0.92), 4),
            "campaign_id": f"CAM-HD2VJ-{r.randint(1, 5):03d}",
        })
    hd_to_vj_schema = StructType([
        StructField("prospect_id", StringType()),
        StructField("hdbank_customer_id", StringType()),
        StructField("customer_name", StringType()),
        StructField("travel_spend_share", DoubleType()),
        StructField("top_airline_merchant", StringType()),
        StructField("recommended_tier", StringType()),
        StructField("propensity_score", DoubleType()),
        StructField("campaign_id", StringType()),
    ])
    write(spark, hd_to_vj, hd_to_vj_schema, cat, schema, "hdbank_to_vietjet_prospects_v1")

    print(f"  {cat}.{schema}: cross-promotion tables seeded ({len(vj_to_hd)} vj→hd prospects, {len(hd_to_vj)} hd→vj prospects)")


def seed_partnership_analytics(spark, customers, bookings, r):
    cat = "partnership_sandbox"
    schema = "analytics"

    # customer_360_v1 — unified view of a customer across both companies
    snapshot = BASE_DATE + timedelta(days=N_DAYS - 1)
    c360_rows = []
    for c in customers:
        vj_spend = sum(b["ticket_amount"] for b in bookings if b["customer_id"] == c["vietjet_id"])
        c360_rows.append({
            "snapshot_date": snapshot,
            "unified_customer_id": uid(),
            "hdbank_customer_id": c["hdbank_id"],
            "vietjet_customer_id": c["vietjet_id"],
            "total_card_spend_vnd": round(r.uniform(500_000, 80_000_000), 0),
            "total_flight_spend_vnd": round(vj_spend, 0),
            "bnpl_outstanding_vnd": round(r.uniform(0, 20_000_000), 0),
            "loyalty_tier": c["loyalty_tier"],
            "segment": c["segment"],
            "last_activity_at": ts(BASE_DATE + timedelta(days=r.randint(N_DAYS // 2, N_DAYS - 1)), r),
        })
    c360_schema = StructType([
        StructField("snapshot_date", DateType()),
        StructField("unified_customer_id", StringType()),
        StructField("hdbank_customer_id", StringType()),
        StructField("vietjet_customer_id", StringType()),
        StructField("total_card_spend_vnd", DoubleType()),
        StructField("total_flight_spend_vnd", DoubleType()),
        StructField("bnpl_outstanding_vnd", DoubleType()),
        StructField("loyalty_tier", StringType()),
        StructField("segment", StringType()),
        StructField("last_activity_at", TimestampType()),
    ])
    write(spark, c360_rows, c360_schema, cat, schema, "customer_360_v1")

    # partnership_revenue_v1 — monthly P&L of the partnership
    revenue_types = [
        ("bnpl_interest", "BNPL Flight", 3_500_000_000),
        ("card_fee", "VietJet HDBank Card", 1_200_000_000),
        ("referral_bonus", "Cross-sell Campaign", 450_000_000),
        ("ancillary_commission", "Ancillary Revenue Share", 800_000_000),
    ]
    pnl_rows = []
    for month_offset in range(3):
        biz_month = f"2025-0{month_offset + 2}"
        for rev_type, product, base_rev in revenue_types:
            customer_cnt = r.randint(80, 300)
            total_rev = round(base_rev * r.uniform(0.8, 1.2), 0)
            pnl_rows.append({
                "business_month": biz_month,
                "revenue_type": rev_type,
                "product": product,
                "customer_count": customer_cnt,
                "total_revenue_vnd": total_rev,
                "avg_revenue_per_customer": round(total_rev / customer_cnt, 2),
            })
    pnl_schema = StructType([
        StructField("business_month", StringType()),
        StructField("revenue_type", StringType()),
        StructField("product", StringType()),
        StructField("customer_count", IntegerType()),
        StructField("total_revenue_vnd", DoubleType()),
        StructField("avg_revenue_per_customer", DoubleType()),
    ])
    write(spark, pnl_rows, pnl_schema, cat, schema, "partnership_revenue_v1")

    print(f"  {cat}.{schema}: analytics tables seeded ({len(c360_rows)} customer 360 rows, {len(pnl_rows)} P&L rows)")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    spark = build_session()
    r = rng()

    print("Generating shared customer pool...")
    customers = make_shared_customers(r)
    print(f"  {len(customers)} shared customers created\n")

    print("=== HDBank Sandbox ===")
    seed_hdbank_bronze(spark, customers, rng(1))
    payments = seed_hdbank_silver(spark, customers, rng(2))
    seed_hdbank_gold(spark, customers, payments, rng(3))

    print("\n=== VietJet Air Sandbox ===")
    seed_vietjetair_bronze(spark, customers, rng(4))
    bookings, ancillary = seed_vietjetair_silver(spark, customers, rng(5))
    seed_vietjetair_gold(spark, bookings, ancillary, rng(6))

    print("\n=== Partnership Sandbox ===")
    seed_partnership_credit_risk(spark, customers, bookings, rng(7))
    seed_partnership_cross_promotion(spark, customers, bookings, rng(8))
    seed_partnership_analytics(spark, customers, bookings, rng(9))

    print("\nSeed data generation complete.")
    spark.stop()


if __name__ == "__main__":
    main()
