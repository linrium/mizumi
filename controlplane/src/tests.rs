use std::time::Duration;

use axum::{Json, extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use rdkafka::{producer::FutureRecord, util::Timeout};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::info;

use crate::{AppError, AppState};

const HDBANK_RAW_CARD_PAYMENT_TOPIC: &str =
    "hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1";
const HDBANK_RAW_CUSTOMER_TOPIC: &str = "hdbank.hdbank_payments_prod_bronze.raw_customer_events_v1";
const VIETJETAIR_RAW_CUSTOMER_TOPIC: &str =
    "vietjetair.vietjetair_bookings_prod_bronze.raw_customer_events_v1";
const VIETJETAIR_RAW_FLIGHT_TOPIC: &str =
    "vietjetair.vietjetair_bookings_prod_bronze.raw_flight_events_v1";
const VIETJETAIR_RAW_BOOKING_TOPIC: &str =
    "vietjetair.vietjetair_bookings_prod_bronze.raw_booking_events_v1";

#[derive(Debug, Deserialize)]
pub struct PublishHdbankPaymentEventRequest {
    pub payment_event_id: String,
    pub customer_id: String,
    pub account_id: String,
    pub transaction_reference: String,
    pub merchant_name: String,
    pub merchant_category: String,
    pub amount: f64,
    pub currency: String,
    pub payment_timestamp: Option<DateTime<Utc>>,
    pub note: String,
}

#[derive(Debug, Deserialize)]
pub struct PublishHdbankCustomerEventRequest {
    pub customer_id: String,
    pub customer_name: String,
    pub segment_name: String,
    pub kyc_status: String,
    pub preferred_channel: String,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct PublishVietjetairCustomerEventRequest {
    pub customer_id: String,
    pub customer_name: String,
    pub membership_tier: String,
    pub home_airport: String,
    pub email_opt_in: bool,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct PublishVietjetairFlightEventRequest {
    pub flight_id: String,
    pub flight_number: String,
    pub route_code: String,
    pub departure_airport: String,
    pub arrival_airport: String,
    pub scheduled_departure_time: DateTime<Utc>,
    pub aircraft_type: String,
}

#[derive(Debug, Deserialize)]
pub struct PublishVietjetairBookingEventRequest {
    pub booking_id: String,
    pub customer_id: String,
    pub pnr_code: String,
    pub payment_reference: String,
    pub route_code: String,
    pub ticket_amount: f64,
    pub currency: String,
    pub booking_timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct PublishEventResponse {
    pub topic: String,
    pub key: String,
    pub timestamp: DateTime<Utc>,
}

async fn publish_raw_event(
    state: &AppState,
    topic: &'static str,
    key: String,
    timestamp: DateTime<Utc>,
    value: String,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    state
        .kafka_producer
        .send(
            FutureRecord::to(topic).key(&key).payload(&value),
            Timeout::After(Duration::from_secs(10)),
        )
        .await
        .map_err(|(e, _)| AppError::Kafka(e.to_string()))?;

    info!(topic, key, %timestamp, "raw test event published");

    Ok((
        StatusCode::ACCEPTED,
        Json(PublishEventResponse {
            topic: topic.to_string(),
            key,
            timestamp,
        }),
    ))
}

pub async fn publish_hdbank_payment_event(
    State(state): State<AppState>,
    Json(req): Json<PublishHdbankPaymentEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    let timestamp = req.payment_timestamp.unwrap_or_else(Utc::now);
    let key = req.payment_event_id.clone();
    let value = json!({
        "payment_event_id": req.payment_event_id,
        "customer_id": req.customer_id,
        "account_id": req.account_id,
        "transaction_reference": req.transaction_reference,
        "merchant_name": req.merchant_name,
        "merchant_category": req.merchant_category,
        "amount": req.amount,
        "currency": req.currency,
        "payment_timestamp": timestamp,
        "note": req.note,
    })
    .to_string();

    publish_raw_event(&state, HDBANK_RAW_CARD_PAYMENT_TOPIC, key, timestamp, value).await
}

pub async fn publish_hdbank_customer_event(
    State(state): State<AppState>,
    Json(req): Json<PublishHdbankCustomerEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    let timestamp = req.updated_at.unwrap_or_else(Utc::now);
    let key = req.customer_id.clone();
    let value = json!({
        "customer_id": req.customer_id,
        "customer_name": req.customer_name,
        "segment_name": req.segment_name,
        "kyc_status": req.kyc_status,
        "preferred_channel": req.preferred_channel,
        "updated_at": timestamp,
    })
    .to_string();

    publish_raw_event(&state, HDBANK_RAW_CUSTOMER_TOPIC, key, timestamp, value).await
}

pub async fn publish_vietjetair_customer_event(
    State(state): State<AppState>,
    Json(req): Json<PublishVietjetairCustomerEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    let timestamp = req.updated_at.unwrap_or_else(Utc::now);
    let key = req.customer_id.clone();
    let value = json!({
        "customer_id": req.customer_id,
        "customer_name": req.customer_name,
        "membership_tier": req.membership_tier,
        "home_airport": req.home_airport,
        "email_opt_in": req.email_opt_in,
        "updated_at": timestamp,
    })
    .to_string();

    publish_raw_event(&state, VIETJETAIR_RAW_CUSTOMER_TOPIC, key, timestamp, value).await
}

pub async fn publish_vietjetair_flight_event(
    State(state): State<AppState>,
    Json(req): Json<PublishVietjetairFlightEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    let timestamp = req.scheduled_departure_time;
    let key = req.flight_id.clone();
    let value = json!({
        "flight_id": req.flight_id,
        "flight_number": req.flight_number,
        "route_code": req.route_code,
        "departure_airport": req.departure_airport,
        "arrival_airport": req.arrival_airport,
        "scheduled_departure_time": req.scheduled_departure_time,
        "aircraft_type": req.aircraft_type,
    })
    .to_string();

    publish_raw_event(&state, VIETJETAIR_RAW_FLIGHT_TOPIC, key, timestamp, value).await
}

pub async fn publish_vietjetair_booking_event(
    State(state): State<AppState>,
    Json(req): Json<PublishVietjetairBookingEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    let timestamp = req.booking_timestamp.unwrap_or_else(Utc::now);
    let key = req.booking_id.clone();
    let value = json!({
        "booking_id": req.booking_id,
        "customer_id": req.customer_id,
        "pnr_code": req.pnr_code,
        "payment_reference": req.payment_reference,
        "route_code": req.route_code,
        "ticket_amount": req.ticket_amount,
        "currency": req.currency,
        "booking_timestamp": timestamp,
    })
    .to_string();

    publish_raw_event(&state, VIETJETAIR_RAW_BOOKING_TOPIC, key, timestamp, value).await
}
