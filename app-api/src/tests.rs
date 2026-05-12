use std::time::Duration;

use axum::{Json, extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use rdkafka::{producer::FutureRecord, util::Timeout};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::info;

use crate::{AppError, AppState};

#[derive(Debug, Deserialize)]
pub struct PublishTransactionEventRequest {
    pub transaction_id: i64,
    pub account_id: i64,
    pub customer_id: i64,
    pub amount: f64,
    pub currency: String,
    pub merchant_category: String,
    pub country_code: String,
    pub transaction_type: String,
    pub status: String,
    pub channel: String,
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct PublishTransactionEventResponse {
    pub topic: String,
    pub key: String,
    pub timestamp: DateTime<Utc>,
}

pub async fn publish_banking_event(
    State(state): State<AppState>,
    Json(req): Json<PublishTransactionEventRequest>,
) -> Result<(StatusCode, Json<PublishTransactionEventResponse>), AppError> {
    let timestamp = req.timestamp.unwrap_or_else(Utc::now);
    let key = req.transaction_id.to_string();
    let payload = json!({
        "transaction_id": req.transaction_id,
        "account_id": req.account_id,
        "customer_id": req.customer_id,
        "amount": req.amount,
        "currency": req.currency,
        "merchant_category": req.merchant_category,
        "country_code": req.country_code,
        "timestamp": timestamp,
        "transaction_type": req.transaction_type,
        "status": req.status,
        "channel": req.channel,
    })
    .to_string();

    state
        .kafka_producer
        .send(
            FutureRecord::to(&state.kafka_topic)
                .key(&key)
                .payload(&payload),
            Timeout::After(Duration::from_secs(10)),
        )
        .await
        .map_err(|(e, _)| AppError::Kafka(e.to_string()))?;

    info!(topic = %state.kafka_topic, key = %key, "banking transaction event published");

    Ok((
        StatusCode::ACCEPTED,
        Json(PublishTransactionEventResponse {
            topic: state.kafka_topic,
            key,
            timestamp,
        }),
    ))
}
