"""
Embeds the STATIC_CATALOGS schema into LanceDB via the OpenAI embeddings API.
One document per table; text includes catalog/schema comments and enriched column descriptions.
Run once after deploying LanceDB to populate the schema_embeddings table.
"""

import asyncio
import hashlib
import os
import re
import signal
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
EMBED_SCHEMA_TIMEOUT_SECONDS = int(os.getenv("EMBED_SCHEMA_TIMEOUT_SECONDS", "240"))
TABLE_NAME = "schema_embeddings"
LOCAL_EMBEDDING_MODEL = "local-hash-v1"
PLACEHOLDER_OPENAI_API_KEY = "test"


class EmbedSchemaTimeout(TimeoutError):
    pass


def handle_timeout(_signum: int, _frame: object) -> None:
    raise EmbedSchemaTimeout(
        f"embed-schema exceeded {EMBED_SCHEMA_TIMEOUT_SECONDS}s timeout; skipping."
    )

# Mirror of STATIC_CATALOGS from packages/webui/services/unity-catalog.ts.
# Each entry becomes one embedded document (one table = one row in LanceDB).
SCHEMA_DOCS = [
    {
        "fqn": "hdbank.hdbank_partnership_prod_bronze.customers_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_bronze",
        "table_name": "customers_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_bronze.customers_v1
Description: Seeded HDBank customer master rows for the partnership demo.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: Raw HDBank customer and banking data for the cross-sell demo.
Columns:
  - customer_id (string): Unique HDBank customer identifier.
  - customer_name (string): Customer full name from the source file.
  - city (string): Primary city associated with the customer.
  - age (int): Customer age in whole years.
  - customer_case (string): Synthetic overlap segment describing whether the customer is shared with VietJet Air.
  - customer_tier (string): Original HDBank relationship tier from the source data.
  - hdbank_affinity_score (double): Synthetic score estimating affinity for HDBank travel-card offers.
  - average_monthly_balance (double): Average monthly account balance in VND.
  - credit_score_band (string): Source credit-quality band used to derive downstream risk fields.
  - hdbank_since (date): Date the customer relationship with HDBank began.
  - has_vietjet_cobrand_card (boolean): Whether the customer already holds the HDBank x VietJet co-brand card.
  - shared_customer (boolean): True when the synthetic customer appears in both partner datasets.
  - seed_timestamp (timestamp): Timestamp when the bronze row was generated.""",
    },
    {
        "fqn": "hdbank.hdbank_partnership_prod_bronze.banking_transactions_v1",
        "catalog": "hdbank",
        "schema_name": "hdbank_partnership_prod_bronze",
        "table_name": "banking_transactions_v1",
        "text": """\
Table: hdbank.hdbank_partnership_prod_bronze.banking_transactions_v1
Description: Synthetic banking transactions keyed to the HDBank customer universe.
Catalog: HDBank demo catalog for co-branded travel card and ticket financing.
Schema: Raw HDBank customer and banking data for the cross-sell demo.
Columns:
  - transaction_id (string): Unique banking or card transaction identifier.
  - customer_id (string): Customer identifier linked to the transaction.
  - accountId (string): Account identifier reported by the event payload.
  - posted_at (timestamp): Timestamp when the transaction posted to the account.
  - transaction_type (string): Normalized transaction type such as salary, transfer, or card payment.
  - channel (string): Origin channel used to initiate the transaction.
  - merchant_category (string): Merchant category used for downstream travel-spend grouping.
  - amount (double): Transaction amount in VND.
  - currency (string): Currency code reported for the transaction.
  - source_bank (string): Originating bank on the transfer or payment.
  - destination_bank (string): Receiving bank on the transfer or payment.
  - merchant_name (string): Merchant or counterparty display name.
  - balance_before (double): Account balance before the transaction posted.
  - balance_after (double): Account balance after the transaction posted.
  - city (string): City associated with the transaction event.
  - touches_hdbank (boolean): True when either side of the movement involves HDBank.
  - seed_timestamp (timestamp): Timestamp when the bronze transaction row was written.""",
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
  - customer_id (string): Unique HDBank customer identifier.
  - customer_name (string): Customer full name used for analyst review.
  - city (string): Primary customer city carried into silver.
  - age (int): Customer age in whole years.
  - segment_name (string): Uppercased marketing segment derived from the HDBank customer tier.
  - preferred_channel (string): Recommended outbound channel derived from age band.
  - monthly_income (double): Estimated monthly income derived from average balance.
  - credit_score (int): Synthetic numeric credit score derived from the source band.
  - has_credit_card (boolean): True when the customer already has a card or qualifies by tier.
  - shared_customer (boolean): True when the customer appears in both partner datasets.
  - customer_case (string): Synthetic overlap segment describing partner relationship coverage.
  - customer_tier (string): Normalized HDBank tier retained for downstream scoring.
  - average_monthly_balance (double): Average monthly balance in VND.
  - credit_score_band (string): Normalized source credit-score band.
  - hdbank_affinity_score (double): Synthetic affinity score for HDBank travel engagement.
  - hdbank_since (date): Date the HDBank relationship started.
  - has_vietjet_cobrand_card (boolean): Whether the customer already holds the co-brand card.
  - kyc_status (string): Derived KYC processing status based on credit score band.
  - updated_at (timestamp): Timestamp when the silver customer profile was last rebuilt.""",
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
  - customer_id (string): Customer identifier used to join travel-spend aggregates.
  - transaction_count (int): Number of qualifying banking transactions observed for the customer.
  - total_card_spend (double): Total non-salary outgoing spend in VND.
  - travel_spend (double): Total spend in travel-related merchant categories in VND.
  - has_vietjet_spend (int): Indicator showing whether any merchant matched VietJet.
  - last_payment_at (timestamp): Most recent transaction timestamp seen for the customer.
  - salary_inflow (double): Total salary inflow recognized in the transaction history.
  - airline_ticket_spend (double): Total spend specifically tagged as airline tickets.
  - ota_travel_spend (double): Total spend at online travel agencies.
  - avg_spend_amount (double): Average amount of non-salary outgoing transactions.
  - travel_affinity_score (double): Derived score estimating propensity for travel purchases.
  - cross_sell_readiness_score (double): Derived score estimating readiness for VietJet cross-sell outreach.""",
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
  - customer_id (string): HDBank customer selected for VietJet activation outreach.
  - customer_name (string): Customer name for campaign operations and review.
  - offer_name (string): Recommended VietJet offer variant for the customer.
  - use_case (string): Reason the customer qualified for this outbound use case.
  - propensity_score (double): Model-style score estimating likelihood of VietJet activation.
  - recommended_channel (string): Best outreach channel chosen for the activation offer.
  - signal_value (double): Primary supporting signal value, based on travel spend.""",
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
Schema: Raw VietJet customer, ticket, and incident data for the cross-sell demo.
Columns:
  - customer_id (string): Unique VietJet Air customer identifier.
  - customer_name (string): Customer full name from the source file.
  - city (string): Primary city associated with the flyer.
  - age (int): Customer age in whole years.
  - customer_case (string): Synthetic overlap segment describing whether the flyer is shared with HDBank.
  - skyboss_tier (string): Original SkyBoss loyalty tier from the source data.
  - vietjetair_affinity_score (double): Synthetic score estimating affinity for VietJet Air offers.
  - annual_flights (int): Approximate annual flight count from the source data.
  - ancillary_spend_score (double): Synthetic score representing ancillaries purchase behavior.
  - vietjetair_since (date): Date the customer relationship with VietJet Air began.
  - has_hdbank_cobrand_card (boolean): Whether the flyer already has the HDBank x VietJet co-brand card.
  - shared_customer (boolean): True when the synthetic customer appears in both partner datasets.
  - seed_timestamp (timestamp): Timestamp when the bronze row was generated.""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_bronze.flight_tickets_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_bronze",
        "table_name": "flight_tickets_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_bronze.flight_tickets_v1
Description: Synthetic flight ticket activity for the VietJet customer universe.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: Raw VietJet customer, ticket, and incident data for the cross-sell demo.
Columns:
  - ticket_id (string): Unique ticket or booking identifier for the itinerary.
  - customer_id (string): Customer identifier associated with the booking.
  - booking_reference (string): PNR or booking reference code.
  - airline (string): Operating or booked airline name.
  - flight_number (string): Flight designator for the booked segment.
  - trip_type (string): Trip shape such as one-way or round-trip.
  - origin_airport (string): Departure airport code for the itinerary.
  - destination_airport (string): Arrival airport code for the itinerary.
  - booking_at (timestamp): Timestamp when the booking was created.
  - departure_at (timestamp): Scheduled departure timestamp for the outbound leg.
  - return_departure_at (timestamp): Scheduled departure timestamp for the return leg, if present.
  - cabin_class (string): Cabin class booked for the itinerary.
  - passenger_count (int): Number of passengers included in the booking.
  - distance_km (int): Approximate route distance in kilometers.
  - flight_duration_minutes (int): Scheduled flight duration in minutes.
  - base_fare (double): Base fare before taxes and extras, in VND.
  - taxes (double): Taxes and fees applied to the booking, in VND.
  - total_price (double): Total booking price paid, in VND.
  - currency (string): Currency code reported for the booking.
  - baggage_kg (int): Checked baggage allowance or purchased baggage weight in kilograms.
  - status (string): Ticketing or booking status.
  - city (string): Customer home city associated with the booking.
  - is_vietjet_air (boolean): True when the booking is on VietJet Air rather than a competitor.
  - seed_timestamp (timestamp): Timestamp when the bronze ticket row was written.""",
    },
    {
        "fqn": "vietjetair.vietjetair_partnership_prod_bronze.flight_incidents_v1",
        "catalog": "vietjetair",
        "schema_name": "vietjetair_partnership_prod_bronze",
        "table_name": "flight_incidents_v1",
        "text": """\
Table: vietjetair.vietjetair_partnership_prod_bronze.flight_incidents_v1
Description: Synthetic VietJet incident reports including baggage damage image references.
Catalog: VietJet Air demo catalog for HDBank travel financing cross-sell.
Schema: Raw VietJet customer, ticket, and incident data for the cross-sell demo.
Columns:
  - report_id (string): Unique incident report identifier.
  - customer_id (string): Customer identifier tied to the incident.
  - ticket_id (string): Ticket identifier associated with the incident.
  - booking_reference (string): Booking reference linked to the affected itinerary.
  - airline (string): Airline associated with the reported incident.
  - report_channel (string): Channel used to submit the incident report.
  - incident_type (string): Normalized incident category such as baggage damage or delay.
  - severity (string): Reported severity level of the incident.
  - issue_airport (string): Airport where the issue was reported or observed.
  - origin_airport (string): Origin airport of the affected trip.
  - destination_airport (string): Destination airport of the affected trip.
  - flight_number (string): Flight number linked to the incident.
  - departure_date (timestamp): Scheduled departure timestamp for the affected flight.
  - reported_at (timestamp): Timestamp when the incident was reported.
  - status (string): Current case status for the incident.
  - baggage_tag (string): Baggage tag reference when the issue involves checked luggage.
  - delayed_minutes (int): Reported delay duration in minutes.
  - currency (string): Currency code associated with any claim value.
  - city (string): Customer city recorded on the incident.
  - image_path (string): Object path for supporting incident imagery, when available.
  - has_image (boolean): True when a supporting incident image is attached.
  - seed_timestamp (timestamp): Timestamp when the bronze incident row was written.""",
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
  - customer_id (string): Unique VietJet Air customer identifier.
  - customer_name (string): Customer full name used for analyst review.
  - city (string): Primary customer city carried into silver.
  - age (int): Customer age in whole years.
  - membership_tier (string): Normalized loyalty tier used for downstream segmentation.
  - home_airport (string): Derived home airport based on the customer's city.
  - email_opt_in (boolean): Derived indicator showing whether email is a viable outreach channel.
  - shared_customer (boolean): True when the flyer appears in both partner datasets.
  - customer_case (string): Synthetic overlap segment describing partner relationship coverage.
  - skyboss_tier (string): Original loyalty tier retained for traceability.
  - annual_flights (int): Approximate annual flight count retained for targeting.
  - ancillary_spend_score (double): Synthetic score summarizing ancillary purchase behavior.
  - vietjetair_affinity_score (double): Synthetic affinity score for VietJet engagement.
  - vietjetair_since (date): Date the VietJet Air relationship started.
  - has_hdbank_cobrand_card (boolean): Whether the flyer already holds the co-brand card.
  - updated_at (timestamp): Timestamp when the silver customer profile was last rebuilt.""",
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
  - customer_id (string): Customer identifier used to join booking aggregates.
  - booking_count (int): Number of bookings observed for the customer.
  - gross_booking_value (double): Total booking spend across all observed itineraries, in VND.
  - avg_booking_value (double): Average booking value per itinerary, in VND.
  - last_booking_at (timestamp): Most recent booking timestamp seen for the customer.
  - vietjet_booking_count (int): Count of bookings flown on VietJet Air.
  - competitor_booking_count (int): Count of bookings flown on non-VietJet carriers.
  - vietjet_booking_value (double): Total spend on VietJet-operated bookings, in VND.
  - avg_baggage_kg (double): Average baggage weight attached to bookings.
  - avg_distance_km (double): Average route distance across bookings.
  - incident_count (int): Number of incident reports linked to the customer.
  - baggage_damage_count (int): Number of baggage-damage incidents reported.
  - baggage_incident_count (int): Number of baggage-related incidents reported.
  - avg_delay_minutes (double): Average delay duration across linked incidents.
  - last_incident_at (timestamp): Most recent incident report timestamp seen for the customer.
  - has_baggage_image (int): Indicator showing whether any baggage incident has image evidence.
  - frequent_flyer_score (double): Derived score estimating frequency and value of flying behavior.
  - service_recovery_score (double): Derived score estimating need for service-recovery outreach.""",
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
  - customer_id (string): VietJet Air customer selected for HDBank finance outreach.
  - customer_name (string): Customer name for campaign operations and review.
  - offer_name (string): Recommended HDBank offer variant for the flyer.
  - use_case (string): Reason the customer qualified for this outbound use case.
  - propensity_score (double): Model-style score estimating likelihood of HDBank conversion.
  - recommended_channel (string): Best outreach channel chosen for the finance offer.
  - signal_value (double): Primary supporting signal value, based on booking value.""",
    },
    {
        "fqn": "partnership.co_brand_silver.customer_360_v1",
        "catalog": "partnership",
        "schema_name": "co_brand_silver",
        "table_name": "customer_360_v1",
        "text": """\
Table: partnership.co_brand_silver.customer_360_v1
Description: Customer-level cross-brand profile with spend, booking, and service signals.
Catalog: Shared partnership outputs for co-brand campaign planning.
Schema: Unified customer 360 features for cross-sell scoring.
Columns:
  - customer_id (string): Unified customer identifier across HDBank and VietJet Air views.
  - customer_name (string): Best available customer name across both partners.
  - city (string): Best available customer city across both partners.
  - age (int): Best available customer age across both partners.
  - has_hdbank_relationship (boolean): True when the customer exists in HDBank silver data.
  - has_vietjetair_relationship (boolean): True when the customer exists in VietJet Air silver data.
  - shared_customer (boolean): True when the customer is present in both partner datasets.
  - segment_name (string): HDBank-derived marketing segment for the customer.
  - preferred_channel (string): HDBank-derived preferred outreach channel.
  - monthly_income (double): Estimated monthly income from HDBank balance behavior.
  - credit_score (int): Synthetic HDBank-derived numeric credit score.
  - has_credit_card (boolean): Whether the HDBank profile indicates card ownership or eligibility.
  - average_monthly_balance (double): Average HDBank monthly balance in VND.
  - transaction_count (int): Number of HDBank transactions summarized for the customer.
  - total_card_spend (double): Total HDBank outgoing spend summarized in silver.
  - travel_spend (double): Total HDBank travel-category spend in VND.
  - airline_ticket_spend (double): Total HDBank spend on airline tickets in VND.
  - ota_travel_spend (double): Total HDBank spend at online travel agencies in VND.
  - has_vietjet_spend (int): Indicator showing whether HDBank transactions include VietJet spend.
  - travel_affinity_score (double): HDBank-derived score for travel purchase propensity.
  - cross_sell_readiness_score (double): HDBank-derived score for VietJet cross-sell readiness.
  - membership_tier (string): VietJet Air loyalty tier for the customer.
  - home_airport (string): Derived VietJet Air home airport for the customer.
  - email_opt_in (boolean): Derived indicator that email is a viable VietJet outreach channel.
  - annual_flights (int): Approximate annual flight count from VietJet profile data.
  - ancillary_spend_score (double): Synthetic score representing ancillary purchase behavior.
  - has_hdbank_cobrand_card (boolean): Whether the VietJet profile indicates co-brand card ownership.
  - booking_count (int): Total observed bookings from VietJet booking features.
  - vietjet_booking_count (int): Count of bookings made on VietJet Air.
  - competitor_booking_count (int): Count of bookings made on competitor airlines.
  - gross_booking_value (double): Total booking spend summarized from VietJet data, in VND.
  - avg_booking_value (double): Average booking value summarized from VietJet data, in VND.
  - incident_count (int): Total number of linked service incidents.
  - baggage_damage_count (int): Number of linked baggage-damage incidents.
  - baggage_incident_count (int): Number of linked baggage-related incidents.
  - avg_delay_minutes (double): Average reported delay duration across incidents.
  - has_baggage_image (int): Indicator showing whether baggage evidence images exist.
  - frequent_flyer_score (double): Derived VietJet score for flight frequency and value.
  - service_recovery_score (double): Derived VietJet score for service-recovery need.
  - hdbank_priority_band (string): Priority bucket derived from HDBank cross-sell readiness.
  - vietjet_priority_band (string): Priority bucket derived from VietJet frequent-flyer score.
  - updated_at (timestamp): Timestamp when the customer 360 profile was last rebuilt.""",
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
  - customer_id (string): Customer identifier in the shared outbound audience.
  - customer_name (string): Customer name for campaign activation workflows.
  - offer_name (string): Offer selected for the outbound audience member.
  - use_case (string): Cross-sell scenario that produced the audience row.
  - propensity_score (double): Unified score estimating likelihood of response.
  - recommended_channel (string): Best outreach channel for the selected offer.
  - signal_value (double): Primary business signal carried forward from the source candidate table.
  - source_company (string): Partner company originating the recommendation.
  - target_company (string): Partner company receiving the candidate for activation.
  - priority_band (string): Priority bucket derived from the propensity score.""",
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
  - campaign_name (string): Unique campaign identifier.
  - source_company (string): Company contributing the audience.
  - target_company (string): Company activating the offer.
  - offer_name (string): Co-brand offer name.
  - customer_count (int): Number of customers in the campaign audience.
  - avg_propensity_score (double): Average propensity score across the audience.
  - total_signal_value (double): Sum of signal values for the entire audience in VND.""",
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


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", text.lower())


def local_embed_text(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIM

    for token in tokenize(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:8], "big") % EMBEDDING_DIM
        sign = -1.0 if digest[8] % 2 else 1.0
        weight = 1.0 + (digest[9] / 255.0)
        vector[idx] += sign * weight

    norm = sum(value * value for value in vector) ** 0.5
    if norm == 0:
        return vector

    return [value / norm for value in vector]


def local_embed_texts(texts: list[str]) -> list[list[float]]:
    return [local_embed_text(text) for text in texts]


async def async_main() -> None:
    openai_api_key = OPENAI_API_KEY.strip()
    if openai_api_key.lower() == PLACEHOLDER_OPENAI_API_KEY:
        print(
            f"OPENAI_API_KEY is {PLACEHOLDER_OPENAI_API_KEY!r}; skipping schema embeddings.",
            flush=True,
        )
        return

    client: OpenAI | None = None
    using_local_embeddings = not openai_api_key
    if using_local_embeddings:
        print(
            "OPENAI_API_KEY is not set; using deterministic local fallback embeddings "
            f"({LOCAL_EMBEDDING_MODEL}, dim={EMBEDDING_DIM}).",
            flush=True,
        )
    else:
        openai_kwargs: dict = {"api_key": openai_api_key}
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
    active_model = LOCAL_EMBEDDING_MODEL if using_local_embeddings else EMBEDDING_MODEL
    print(f"embedding {len(texts)} documents with {active_model} (dim={EMBEDDING_DIM})...", flush=True)

    if using_local_embeddings:
        embeddings = local_embed_texts(texts)
        print(f"  {len(texts)}/{len(texts)} embedded", flush=True)
    else:
        embeddings = []
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
    if EMBED_SCHEMA_TIMEOUT_SECONDS > 0:
        signal.signal(signal.SIGALRM, handle_timeout)
        signal.alarm(EMBED_SCHEMA_TIMEOUT_SECONDS)

    try:
        asyncio.run(async_main())
    except EmbedSchemaTimeout as e:
        print(str(e), flush=True)
    finally:
        if EMBED_SCHEMA_TIMEOUT_SECONDS > 0:
            signal.alarm(0)
