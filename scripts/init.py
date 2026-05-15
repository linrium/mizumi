import json, os, time, sys, urllib.request, urllib.error

UC = "http://localhost:8080/api/2.1/unity-catalog"
TOKEN = os.environ.get("UC_TOKEN", "")

def _headers(extra=None):
  h = {}
  if TOKEN:
      h["Authorization"] = f"Bearer {TOKEN}"
  if extra:
      h.update(extra)
  return h

def post(path, data):
  req = urllib.request.Request(
      f"{UC}/{path}",
      data=json.dumps(data).encode(),
      headers=_headers({"Content-Type": "application/json"}),
      method="POST",
  )
  try:
      with urllib.request.urlopen(req) as r:
          print("  ok:", json.loads(r.read()).get("name", ""))
  except urllib.error.HTTPError as e:
      msg = e.read().decode()
      if e.code == 409:
          print("  already exists")
      else:
          print(f"  ERROR {e.code}: {msg[:300]}", file=sys.stderr)

def col(name, type_name, type_text, json_type, pos, nullable=True, partition_index=-1):
  return {
      "name": name,
      "type_text": type_text,
      "type_json": json.dumps({
          "name": name,
          "type": json_type,
          "nullable": nullable,
          "metadata": {},
      }, separators=(",", ":")),
      "type_name": type_name,
      "type_precision": 0,
      "type_scale": 0,
      "type_interval_type": "",
      "position": pos,
      "comment": "",
      "nullable": nullable,
      "partition_index": partition_index,
  }

def build_cols(specs):
  return [col(name, type_name, type_text, json_type, pos) for pos, (name, type_name, type_text, json_type) in enumerate(specs)]

HDBANK_RAW_CARD_PAYMENT_EVENTS_V1 = build_cols([
  ("timestamp", "TIMESTAMP", "timestamp", "timestamp"),
  ("key", "STRING", "string", "string"),
  ("value", "STRING", "string", "string"),
])

HDBANK_RAW_CUSTOMER_EVENTS_V1 = build_cols([
  ("timestamp", "TIMESTAMP", "timestamp", "timestamp"),
  ("key", "STRING", "string", "string"),
  ("value", "STRING", "string", "string"),
])

HDBANK_CARD_PAYMENT_EVENTS_V1 = build_cols([
  ("payment_event_id", "STRING", "string", "string"),
  ("customer_id", "STRING", "string", "string"),
  ("account_id", "STRING", "string", "string"),
  ("transaction_reference", "STRING", "string", "string"),
  ("merchant_name", "STRING", "string", "string"),
  ("merchant_category", "STRING", "string", "string"),
  ("amount", "DOUBLE", "double", "double"),
  ("currency", "STRING", "string", "string"),
  ("payment_timestamp", "TIMESTAMP", "timestamp", "timestamp"),
  ("note", "STRING", "string", "string"),
])

HDBANK_CUSTOMER_PROFILE_V1 = build_cols([
  ("customer_id", "STRING", "string", "string"),
  ("customer_name", "STRING", "string", "string"),
  ("segment_name", "STRING", "string", "string"),
  ("kyc_status", "STRING", "string", "string"),
  ("preferred_channel", "STRING", "string", "string"),
  ("updated_at", "TIMESTAMP", "timestamp", "timestamp"),
])

HDBANK_RISK_DETECTION_V1 = build_cols([
  ("detection_date", "DATE", "date", "date"),
  ("payment_event_id", "STRING", "string", "string"),
  ("customer_id", "STRING", "string", "string"),
  ("account_id", "STRING", "string", "string"),
  ("risk_label", "STRING", "string", "string"),
  ("risk_score", "DOUBLE", "double", "double"),
  ("note_signal", "STRING", "string", "string"),
  ("model_version", "STRING", "string", "string"),
])

HDBANK_MERCHANT_REVENUE_V1 = build_cols([
  ("business_date", "DATE", "date", "date"),
  ("merchant_name", "STRING", "string", "string"),
  ("merchant_category", "STRING", "string", "string"),
  ("transaction_count", "INT", "int", "integer"),
  ("gross_payment_volume", "DOUBLE", "double", "double"),
  ("fee_revenue", "DOUBLE", "double", "double"),
  ("currency", "STRING", "string", "string"),
])

HDBANK_USER_SPEND_V1 = build_cols([
  ("business_date", "DATE", "date", "date"),
  ("customer_id", "STRING", "string", "string"),
  ("account_id", "STRING", "string", "string"),
  ("transaction_count", "INT", "int", "integer"),
  ("total_spend", "DOUBLE", "double", "double"),
  ("avg_ticket_size", "DOUBLE", "double", "double"),
  ("top_merchant_category", "STRING", "string", "string"),
  ("currency", "STRING", "string", "string"),
])

VIETJETAIR_RAW_CUSTOMER_EVENTS_V1 = build_cols([
  ("timestamp", "TIMESTAMP", "timestamp", "timestamp"),
  ("key", "STRING", "string", "string"),
  ("value", "STRING", "string", "string"),
])

VIETJETAIR_RAW_FLIGHT_EVENTS_V1 = build_cols([
  ("timestamp", "TIMESTAMP", "timestamp", "timestamp"),
  ("key", "STRING", "string", "string"),
  ("value", "STRING", "string", "string"),
])

VIETJETAIR_RAW_BOOKING_EVENTS_V1 = build_cols([
  ("timestamp", "TIMESTAMP", "timestamp", "timestamp"),
  ("key", "STRING", "string", "string"),
  ("value", "STRING", "string", "string"),
])

VIETJETAIR_TICKET_BOOKINGS_V1 = build_cols([
  ("booking_id", "STRING", "string", "string"),
  ("customer_id", "STRING", "string", "string"),
  ("pnr_code", "STRING", "string", "string"),
  ("payment_reference", "STRING", "string", "string"),
  ("route_code", "STRING", "string", "string"),
  ("ticket_amount", "DOUBLE", "double", "double"),
  ("currency", "STRING", "string", "string"),
  ("booking_timestamp", "TIMESTAMP", "timestamp", "timestamp"),
])

VIETJETAIR_CUSTOMERS_V1 = build_cols([
  ("customer_id", "STRING", "string", "string"),
  ("customer_name", "STRING", "string", "string"),
  ("membership_tier", "STRING", "string", "string"),
  ("home_airport", "STRING", "string", "string"),
  ("email_opt_in", "BOOLEAN", "boolean", "boolean"),
  ("updated_at", "TIMESTAMP", "timestamp", "timestamp"),
])

VIETJETAIR_FLIGHTS_V1 = build_cols([
  ("flight_id", "STRING", "string", "string"),
  ("flight_number", "STRING", "string", "string"),
  ("route_code", "STRING", "string", "string"),
  ("departure_airport", "STRING", "string", "string"),
  ("arrival_airport", "STRING", "string", "string"),
  ("scheduled_departure_time", "TIMESTAMP", "timestamp", "timestamp"),
  ("aircraft_type", "STRING", "string", "string"),
])

VIETJETAIR_BOOKING_REVENUE_V1 = build_cols([
  ("business_date", "DATE", "date", "date"),
  ("route_code", "STRING", "string", "string"),
  ("booking_count", "INT", "int", "integer"),
  ("ticket_revenue", "DOUBLE", "double", "double"),
  ("ancillary_revenue", "DOUBLE", "double", "double"),
  ("currency", "STRING", "string", "string"),
])

VIETJETAIR_CUSTOMER_SPEND_V1 = build_cols([
  ("business_date", "DATE", "date", "date"),
  ("customer_id", "STRING", "string", "string"),
  ("booking_count", "INT", "int", "integer"),
  ("total_ticket_spend", "DOUBLE", "double", "double"),
  ("avg_booking_value", "DOUBLE", "double", "double"),
  ("favorite_route_code", "STRING", "string", "string"),
  ("currency", "STRING", "string", "string"),
])

CATALOGS = {
  "hdbank": {
      "comment": "HDBank demo catalog with Kafka bronze events and banking silver/gold marts",
      "schemas": {
          "hdbank_payments_prod_bronze": {
              "comment": "Raw HDBank Kafka events for payments and customers",
              "tables": [
                  {
                      "name": "raw_card_payment_events_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_card_payment_events_v1",
                      "columns": HDBANK_RAW_CARD_PAYMENT_EVENTS_V1,
                      "comment": "Raw HDBank card payment Kafka events with event metadata and payload fields",
                  },
                  {
                      "name": "raw_customer_events_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_customer_events_v1",
                      "columns": HDBANK_RAW_CUSTOMER_EVENTS_V1,
                      "comment": "Raw HDBank customer Kafka events with event metadata and payload fields",
                  },
              ],
          },
          "hdbank_payments_prod_silver": {
              "comment": "Conformed HDBank payment and customer entities",
              "tables": [
                  {
                      "name": "card_payment_events_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_silver/card_payment_events_v1",
                      "columns": HDBANK_CARD_PAYMENT_EVENTS_V1,
                      "comment": "Conformed HDBank payment events with transaction note retained for downstream ML",
                  },
                  {
                      "name": "customers_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_silver/customers_v1",
                      "columns": HDBANK_CUSTOMER_PROFILE_V1,
                      "comment": "Conformed HDBank customer profile dimension built from customer events",
                  },
              ],
          },
          "hdbank_payments_prod_gold": {
              "comment": "Business-ready HDBank risk and monetization marts",
              "tables": [
                  {
                      "name": "risk_detection_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_gold/risk_detection_v1",
                      "columns": HDBANK_RISK_DETECTION_V1,
                      "comment": "Gold risk detections from transaction behavior and note-text ML scoring",
                  },
                  {
                      "name": "merchant_revenue_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_gold/merchant_revenue_v1",
                      "columns": HDBANK_MERCHANT_REVENUE_V1,
                      "comment": "Gold merchant revenue mart for payment fee and GPV analysis",
                  },
                  {
                      "name": "user_spend_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/hdbank/hdbank_payments_prod_gold/user_spend_v1",
                      "columns": HDBANK_USER_SPEND_V1,
                      "comment": "Gold user spend mart by customer and account",
                  },
              ],
          },
      },
  },
  "vietjetair": {
      "comment": "VietJet Air demo catalog with Kafka bronze events and aviation silver/gold marts",
      "schemas": {
          "vietjetair_bookings_prod_bronze": {
              "comment": "Raw VietJet Kafka events for customers, flights, and bookings",
              "tables": [
                  {
                      "name": "raw_customer_events_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_customer_events_v1",
                      "columns": VIETJETAIR_RAW_CUSTOMER_EVENTS_V1,
                      "comment": "Raw VietJet customer Kafka events with event metadata and payload fields",
                  },
                  {
                      "name": "raw_flight_events_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_flight_events_v1",
                      "columns": VIETJETAIR_RAW_FLIGHT_EVENTS_V1,
                      "comment": "Raw VietJet flight Kafka events with operational metadata and payload fields",
                  },
                  {
                      "name": "raw_booking_events_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_booking_events_v1",
                      "columns": VIETJETAIR_RAW_BOOKING_EVENTS_V1,
                      "comment": "Raw VietJet booking Kafka events with payment and booking payload fields",
                  },
              ],
          },
          "vietjetair_bookings_prod_silver": {
              "comment": "Conformed VietJet customer, flight, and booking entities",
              "tables": [
                  {
                      "name": "ticket_bookings_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/ticket_bookings_v1",
                      "columns": VIETJETAIR_TICKET_BOOKINGS_V1,
                      "comment": "Conformed VietJet ticket bookings with payment reference and route context",
                  },
                  {
                      "name": "customers_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/customers_v1",
                      "columns": VIETJETAIR_CUSTOMERS_V1,
                      "comment": "Conformed VietJet customer dimension built from customer events",
                  },
                  {
                      "name": "flights_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/flights_v1",
                      "columns": VIETJETAIR_FLIGHTS_V1,
                      "comment": "Conformed VietJet flight dimension built from flight events",
                  },
              ],
          },
          "vietjetair_bookings_prod_gold": {
              "comment": "Business-ready VietJet revenue and customer value marts",
              "tables": [
                  {
                      "name": "booking_revenue_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_gold/booking_revenue_v1",
                      "columns": VIETJETAIR_BOOKING_REVENUE_V1,
                      "comment": "Gold booking revenue mart by route and business date",
                  },
                  {
                      "name": "customer_spend_v1",
                      "data_source_format": "DELTA",
                      "storage_location": "s3://unitycatalog/vietjetair/vietjetair_bookings_prod_gold/customer_spend_v1",
                      "columns": VIETJETAIR_CUSTOMER_SPEND_V1,
                      "comment": "Gold customer spend mart across bookings and routes",
                  },
              ],
          },
      },
  },
}

# ── Bootstrap ─────────────────────────────────────────────────────────

print("Waiting for UC server...")
for _ in range(60):
  try:
      urllib.request.urlopen(urllib.request.Request(f"{UC}/catalogs", headers=_headers()))
      print("UC server ready")
      break
  except:
      time.sleep(5)
else:
  sys.exit("UC did not start in time")

for catalog_name, catalog in CATALOGS.items():
  print(f"\nCreating catalog: {catalog_name}")
  post("catalogs", {"name": catalog_name, "comment": catalog["comment"]})

  for schema_name, schema in catalog["schemas"].items():
      print(f"\nCreating schema: {catalog_name}.{schema_name}")
      post("schemas", {
          "name": schema_name,
          "catalog_name": catalog_name,
          "comment": schema["comment"],
      })

      for t in schema["tables"]:
          print(f"  Registering table: {t['name']}")
          post("tables", {
              "catalog_name": catalog_name,
              "schema_name": schema_name,
              "table_type": "EXTERNAL",
              **t,
          })

print("\nBootstrap complete.")
for catalog_name, catalog in CATALOGS.items():
  for schema_name in catalog["schemas"]:
      with urllib.request.urlopen(
          urllib.request.Request(
              f"{UC}/tables?catalog_name={catalog_name}&schema_name={schema_name}",
              headers=_headers(),
          )
      ) as r:
          data = json.loads(r.read())
          names = [t.get("name") for t in data.get("tables", [])]
          print(f"  {catalog_name}.{schema_name}: {names}")