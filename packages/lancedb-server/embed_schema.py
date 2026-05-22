"""
Embeds the STATIC_CATALOGS schema into LanceDB via the OpenAI embeddings API.
One document per table; text includes catalog/schema comments and enriched column descriptions.
Run once after `just lancedb-deploy` to populate the schema_embeddings table.
"""

import asyncio
import os
import boto3
import pyarrow as pa
import lancedb
from lancedb.index import FTS
from botocore.exceptions import ClientError
from openai import OpenAI

LANCEDB_URI = os.getenv("LANCEDB_URI", "s3://lancedb/")
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://rustfs-svc.rustfs.svc.cluster.local:9000")
S3_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "rustfsadmin")
S3_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "rustfsadmin")
S3_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
S3_BUCKET = os.getenv("LANCEDB_BUCKET", "lancedb")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))
TABLE_NAME = "schema_embeddings"

# Mirror of STATIC_CATALOGS from packages/webui/services/unity-catalog.ts.
# Each entry becomes one embedded document (one table = one row in LanceDB).
SCHEMA_DOCS = [
    {
        "fqn": "hdbank.hdbank_partnership_prod_bronze.partner_events_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_bronze",
        "table_name": "partner_events_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_bronze.partner_events_v1
Description: Mixed HDBank customer and card transaction events.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: Raw HDBank partner events from the single company topic.
Columns:
  - timestamp (timestamp): Kafka message ingestion timestamp
  - key (string): Kafka partition key identifying the customer or entity
  - event_type (string): Event discriminator, e.g. card_transaction, customer_update, credit_check
  - value (string): JSON-encoded payload of the event""",
    },
    {
        "fqn": "hdbank.hdbank_partnership_prod_bronze.customers_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_bronze",
        "table_name": "customers_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_bronze.customers_v1
Description: Seeded HDBank customer master rows for the partnership demo.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: Raw HDBank partner events from the single company topic.
Columns:
  - unified_customer_id (string): Cross-company identifier linking HDBank and VietJet customer records
  - customer_id (string): HDBank internal customer identifier
  - customer_name (string): Full name of the HDBank customer
  - city (string): City of residence
  - age (int): Customer age in years
  - segment_name (string): HDBank customer segment, e.g. Mass, Affluent, Premier
  - preferred_channel (string): Preferred contact channel, e.g. mobile, branch, email
  - monthly_income (double): Declared or estimated monthly income in VND
  - credit_score (int): HDBank internal credit score
  - has_credit_card (boolean): Whether the customer holds an active HDBank credit card
  - shared_customer (boolean): Whether this customer record is also shared with VietJet
  - seed_timestamp (timestamp): Timestamp when the seed record was loaded into the bronze layer""",
    },
    {
        "fqn": "hdbank.hdbank_partnership_prod_silver.customers_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_silver",
        "table_name": "customers_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_silver.customers_v1
Description: Latest HDBank customer profiles for cross-sell analysis.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: HDBank customer and travel-affinity features.
Columns:
  - customer_id (string): HDBank internal customer identifier
  - customer_name (string): Full name of the customer
  - segment_name (string): HDBank customer segment, e.g. Mass, Affluent, Premier
  - kyc_status (string): KYC verification status, e.g. verified, pending, rejected
  - preferred_channel (string): Preferred contact channel, e.g. mobile, branch, email
  - monthly_income (double): Monthly income in VND
  - credit_score (int): HDBank internal credit score
  - has_credit_card (boolean): Active HDBank credit card flag
  - shared_customer (boolean): Whether this customer is also known to VietJet
  - updated_at (timestamp): Timestamp of the most recent profile update""",
    },
    {
        "fqn": "hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_silver",
        "table_name": "travel_spend_features_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1
Description: Travel affinity features from HDBank card transactions.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: HDBank customer and travel-affinity features.
Columns:
  - customer_id (string): HDBank customer identifier
  - transaction_count (int): Total number of card transactions observed
  - total_card_spend (double): Total card spend across all merchants in VND
  - travel_spend (double): Spend on travel-related merchants in VND
  - has_vietjet_spend (int): 1 if the customer has any VietJet-related card spend, 0 otherwise
  - last_payment_at (timestamp): Timestamp of the most recent card payment
  - travel_affinity_score (double): Derived score (0–1) indicating likelihood of VietJet conversion based on travel spend patterns""",
    },
    {
        "fqn": "hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_gold",
        "table_name": "vietjet_activation_candidates_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1
Description: HDBank customers most likely to convert into VietJet flyers.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: HDBank outbound activation targets for VietJet.
Columns:
  - customer_id (string): HDBank customer identifier
  - customer_name (string): Customer full name
  - offer_name (string): Co-brand offer name being recommended, e.g. vietjet_co_brand_card
  - use_case (string): Business use case driving the recommendation, e.g. co_brand_travel_card
  - propensity_score (double): Model-derived propensity score (0–1); higher means more likely to convert
  - recommended_channel (string): Best contact channel for activating this customer
  - signal_value (double): Aggregate monetary signal in VND driving the recommendation""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_bronze.partner_events_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_bronze",
        "table_name": "partner_events_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_bronze.partner_events_v1
Description: Mixed VietJet customer and booking events.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: Raw VietJet partner events from the single company topic.
Columns:
  - timestamp (timestamp): Kafka message ingestion timestamp
  - key (string): Kafka partition key identifying the customer or booking
  - event_type (string): Event discriminator, e.g. booking, cancellation, customer_update
  - value (string): JSON-encoded payload of the event""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_bronze.customers_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_bronze",
        "table_name": "customers_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_bronze.customers_v1
Description: Seeded VietJet customer master rows for the partnership demo.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: Raw VietJet partner events from the single company topic.
Columns:
  - unified_customer_id (string): Cross-company identifier linking VietJet and HDBank customer records
  - customer_id (string): VietJet internal customer identifier
  - customer_name (string): Full name of the VietJet customer
  - city (string): City of residence
  - age (int): Customer age in years
  - membership_tier (string): VietJet loyalty program tier, e.g. Sky Boss, SkyJoy Silver, SkyJoy Gold
  - home_airport (string): Primary departure airport IATA code, e.g. SGN, HAN
  - email_opt_in (boolean): Whether the customer has opted into email marketing
  - shared_customer (boolean): Whether this customer record is also shared with HDBank
  - seed_timestamp (timestamp): Timestamp when the seed record was loaded into the bronze layer""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_silver.customers_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_silver",
        "table_name": "customers_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_silver.customers_v1
Description: Latest VietJet customer profiles for cross-sell analysis.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: VietJet customer and booking features.
Columns:
  - customer_id (string): VietJet internal customer identifier
  - customer_name (string): Full name of the customer
  - membership_tier (string): VietJet loyalty tier
  - home_airport (string): Primary departure airport IATA code
  - email_opt_in (boolean): Email marketing opt-in flag
  - shared_customer (boolean): Whether this customer is also known to HDBank
  - updated_at (timestamp): Timestamp of the most recent profile update""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_silver.booking_features_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_silver",
        "table_name": "booking_features_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_silver.booking_features_v1
Description: Booking intensity features for HDBank finance targeting.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: VietJet customer and booking features.
Columns:
  - customer_id (string): VietJet customer identifier
  - booking_count (int): Total number of VietJet flight bookings
  - gross_booking_value (double): Total value of all bookings in VND
  - avg_booking_value (double): Average booking value per trip in VND
  - last_booking_at (timestamp): Timestamp of the most recent booking
  - frequent_flyer_score (double): Derived score (0–1) measuring booking intensity and recency""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_gold",
        "table_name": "hdbank_finance_candidates_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1
Description: VietJet flyers most likely to take HDBank financing or a co-brand card.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: VietJet outbound activation targets for HDBank.
Columns:
  - customer_id (string): VietJet customer identifier
  - customer_name (string): Customer full name
  - offer_name (string): Financing or co-brand offer name, e.g. hdbank_ticket_financing
  - use_case (string): Business use case, e.g. ticket_financing, co_brand_card
  - propensity_score (double): Model-derived propensity score (0–1)
  - recommended_channel (string): Best contact channel for activating this customer
  - signal_value (double): Aggregate monetary signal driving the recommendation""",
    },
    {
        "fqn": "partnership.co_brand_gold.co_brand_offer_audience_v1",
        "catalog": "partnership",
        "schema_name": "co_brand_gold",
        "table_name": "co_brand_offer_audience_v1",
        "text": """\
Table: partnership.co_brand_gold.co_brand_offer_audience_v1
Description: Unified outbound audience for the co-brand travel use case.
Catalog: Shared partnership outputs for co-brand campaign planning.
Schema: Joint campaign audience and summary outputs.
Columns:
  - customer_id (string): Unified cross-company customer identifier
  - customer_name (string): Customer full name
  - offer_name (string): Co-brand offer being promoted
  - use_case (string): Business use case driving the audience selection
  - propensity_score (double): Propensity score (0–1) for offer acceptance
  - recommended_channel (string): Best contact channel for activation
  - signal_value (double): Monetary signal value in VND
  - source_company (string): Company that contributed this customer, hdbank or vietjetair
  - target_company (string): Company that will activate the offer
  - priority_band (string): Campaign priority tier: high, medium, or low""",
    },
    {
        "fqn": "partnership.co_brand_gold.campaign_summary_v1",
        "catalog": "partnership",
        "schema_name": "co_brand_gold",
        "table_name": "campaign_summary_v1",
        "text": """\
Table: partnership.co_brand_gold.campaign_summary_v1
Description: Compact campaign summary for activation planning.
Catalog: Shared partnership outputs for co-brand campaign planning.
Schema: Joint campaign audience and summary outputs.
Columns:
  - campaign_name (string): Unique campaign identifier
  - source_company (string): Company contributing the audience
  - target_company (string): Company activating the offer
  - offer_name (string): Co-brand offer name
  - customer_count (int): Number of customers in the campaign audience
  - avg_propensity_score (double): Average propensity score across the audience
  - total_signal_value (double): Sum of signal values for the entire audience in VND""",
    },
]


def ensure_bucket() -> None:
    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
    )
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            s3.create_bucket(Bucket=S3_BUCKET)
            print(f"created bucket {S3_BUCKET!r}", flush=True)
        else:
            raise


def embed_texts(client: OpenAI, texts: list[str]) -> list[list[float]]:
    resp = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in resp.data]


async def async_main() -> None:
    openai_kwargs: dict = {"api_key": OPENAI_API_KEY}
    if OPENAI_BASE_URL:
        openai_kwargs["base_url"] = OPENAI_BASE_URL
    client = OpenAI(**openai_kwargs)

    ensure_bucket()

    db = await lancedb.connect_async(
        LANCEDB_URI,
        storage_options={
            "aws_access_key_id": S3_ACCESS_KEY,
            "aws_secret_access_key": S3_SECRET_KEY,
            "endpoint": S3_ENDPOINT,
            "region": S3_REGION,
            "allow_http": "true",
            "aws_virtual_hosted_style_request": "false",
        },
    )

    texts = [d["text"] for d in SCHEMA_DOCS]
    print(f"embedding {len(texts)} documents with {EMBEDDING_MODEL} (dim={EMBEDDING_DIM})...", flush=True)

    embeddings: list[list[float]] = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings.extend(embed_texts(client, batch))
        print(f"  {min(i + batch_size, len(texts))}/{len(texts)} embedded", flush=True)

    schema = pa.schema([
        pa.field("id", pa.int64()),
        pa.field("fqn", pa.utf8()),
        pa.field("catalog", pa.utf8()),
        pa.field("schema_name", pa.utf8()),
        pa.field("table_name", pa.utf8()),
        pa.field("text", pa.utf8()),
        pa.field("vector", pa.list_(pa.float32(), EMBEDDING_DIM)),
    ])

    table = await db.create_table(TABLE_NAME, schema=schema, mode="overwrite")

    vector_arrays = [
        pa.array([float(x) for x in emb], type=pa.float32())
        for emb in embeddings
    ]
    data = pa.table({
        "id": pa.array(range(len(SCHEMA_DOCS)), type=pa.int64()),
        "fqn": pa.array([d["fqn"] for d in SCHEMA_DOCS], type=pa.utf8()),
        "catalog": pa.array([d["catalog"] for d in SCHEMA_DOCS], type=pa.utf8()),
        "schema_name": pa.array([d["schema_name"] for d in SCHEMA_DOCS], type=pa.utf8()),
        "table_name": pa.array([d["table_name"] for d in SCHEMA_DOCS], type=pa.utf8()),
        "text": pa.array(texts, type=pa.utf8()),
        "vector": pa.array(vector_arrays, type=pa.list_(pa.float32(), EMBEDDING_DIM)),
    })
    await table.add(data)
    print(f"inserted {len(SCHEMA_DOCS)} rows into '{TABLE_NAME}'", flush=True)

    await table.create_index("text", config=FTS(with_position=True), replace=True)
    print("FTS index created on 'text' column", flush=True)

    print("done", flush=True)


if __name__ == "__main__":
    asyncio.run(async_main())
