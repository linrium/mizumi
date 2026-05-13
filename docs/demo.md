# Demo Data Model

This demo starts with a Kafka-first medallion layout for `hdbank` and `vietjetair`, using only two catalogs.

## Goal

Support realistic domain analytics first:

- HDBank payment and customer events
- HDBank risk detection and spend analytics
- VietJet customer, flight, and booking events
- VietJet booking revenue and customer spend analytics

## Catalogs

- `hdbank`
- `vietjetair`
## Minimal Schemas And Tables

### `hdbank`

- Schema: `hdbank_payments_prod_bronze`
- Tables:
- `raw_card_payment_events_v1`
- `raw_customer_events_v1`

Purpose:
- Raw HDBank Kafka events.
- Bronze event tables keep only `timestamp`, `key`, and `value`.
- Payload decoding happens in the bronze-to-silver step.

- Schema: `hdbank_payments_prod_silver`
- Tables:
- `card_payment_events_v1`
- `customers_v1`

Purpose:
- Conformed HDBank payment and customer data.
- Payment records keep transaction note text for future ML-based risk detection.
- All identifiers are UUID-shaped and modeled as `STRING`.

- Schema: `hdbank_payments_prod_gold`
- Tables:
- `risk_detection_v1`
- `merchant_revenue_v1`
- `user_spend_v1`

Purpose:
- Risk detection outputs based on payment behavior and note-text signals.
- Merchant revenue and user spend marts for business analytics.

### `vietjetair`

- Schema: `vietjetair_bookings_prod_bronze`
- Tables:
- `raw_customer_events_v1`
- `raw_flight_events_v1`
- `raw_booking_events_v1`

Purpose:
- Raw VietJet Kafka events for customers, flights, and bookings.
- Bronze event tables keep only `timestamp`, `key`, and `value`.

- Schema: `vietjetair_bookings_prod_silver`
- Tables:
- `ticket_bookings_v1`
- `customers_v1`
- `flights_v1`

Purpose:
- Conformed VietJet booking, customer, and flight entities.
- All identifiers are UUID-shaped and modeled as `STRING`.

- Schema: `vietjetair_bookings_prod_gold`
- Tables:
- `booking_revenue_v1`
- `customer_spend_v1`

Purpose:
- Booking revenue and customer spend marts for airline analytics.

## Why This Is Minimal

This first step avoids adding too many schemas and tables before the integration pattern is proven.

It gives three layers of value in each domain:

- Bronze for landed raw events.
- Silver for standardized domain facts.
- Gold for business-facing domain marts.

## Matching Approach

Recommended first-pass design:

- Bronze stores Kafka event envelopes plus selected parsed fields.
- Bronze stores only `timestamp`, `key`, and `value`.
- Silver standardizes domain entities from decoded Kafka payloads.
- Gold publishes domain analytics tables without forcing cross-catalog joins yet.

## Governance Notes

- Keep `hdbank` and `vietjetair` as source-owned catalogs.
- Do not share raw PII as join keys if cross-domain correlation is added later.
- Keep the Kafka envelope in bronze for replayability and auditability.
- Keep bronze raw and minimal so reprocessing logic stays in the decode step.
- Keep free-text transaction notes in silver if they will feed ML risk workflows.

## Storage Layout

Use a single shared bucket with isolation by catalog, schema, and table:

`s3://unitycatalog/<catalog>/<schema>/<table>`

Examples:

- `s3://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_card_payment_events_v1`
- `s3://unitycatalog/hdbank/hdbank_payments_prod_gold/risk_detection_v1`
- `s3://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_booking_events_v1`
- `s3://unitycatalog/vietjetair/vietjetair_bookings_prod_gold/booking_revenue_v1`

## Next Step After This Demo

If the first domain models work, the next tables to add are:

- `hdbank_payments_prod_gold.note_risk_features_v1`
- `hdbank_payments_prod_gold.customer_lifetime_value_v1`
- `vietjetair_bookings_prod_gold.route_profitability_v1`
- `vietjetair_bookings_prod_gold.loyalty_segmentation_v1`
