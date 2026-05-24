use std::time::Duration;

use chrono::Utc;
use rdkafka::{
    producer::{FutureProducer, FutureRecord},
    util::Timeout,
};
use tracing::info;

use crate::domain::{
    entities::test_event::{
        PublishBankingTransactionEventRequest, PublishEventResponse,
        PublishFlightIncidentEventRequest, PublishFlightTicketEventRequest,
        PublishHdbankCustomerEventRequest, PublishVietjetairCustomerEventRequest,
    },
    error::AppError,
};

const HDBANK_PARTNER_EVENTS_TOPIC: &str = "hdbank.partner_events_v1";
const VIETJETAIR_PARTNER_EVENTS_TOPIC: &str = "vietjetair.partner_events_v1";

#[derive(Clone)]
pub struct TestEventService {
    producer: FutureProducer,
}

impl TestEventService {
    pub fn new(producer: FutureProducer) -> Self {
        Self { producer }
    }

    async fn publish_raw_event(
        &self,
        topic: &'static str,
        key: String,
        timestamp: chrono::DateTime<Utc>,
        value: String,
    ) -> Result<PublishEventResponse, AppError> {
        self.producer
            .send(
                FutureRecord::to(topic).key(&key).payload(&value),
                Timeout::After(Duration::from_secs(10)),
            )
            .await
            .map_err(|(e, _)| AppError::Kafka(e.to_string()))?;

        info!(topic, key, %timestamp, "raw test event published");

        Ok(PublishEventResponse {
            topic: topic.to_string(),
            key,
            timestamp,
        })
    }

    fn parse_f64(field: &'static str, value: &str) -> Result<f64, AppError> {
        value
            .parse::<f64>()
            .map_err(|e| AppError::Parse(format!("invalid {} '{}': {}", field, value, e)))
    }

    pub async fn publish_hdbank_customer_events(
        &self,
        reqs: Vec<PublishHdbankCustomerEventRequest>,
    ) -> Result<Vec<PublishEventResponse>, AppError> {
        let mut responses = Vec::with_capacity(reqs.len());

        for req in reqs {
            let timestamp = Utc::now();
            let key = req.user_id.clone();
            let value = serde_json::json!({
                "event_type": "customer_profile_updated",
                "customer_id": req.user_id,
                "customer_name": req.full_name,
                "city": req.city,
                "age": req.age,
                "customer_case": req.customer_case,
                "customer_tier": req.customer_tier,
                "hdbank_affinity_score": req.hdbank_affinity_score,
                "average_monthly_balance": req.average_monthly_balance,
                "credit_score_band": req.credit_score_band,
                "hdbank_since": req.hdbank_since,
                "has_vietjet_co_brand_card": req.has_vietjet_co_brand_card,
                "updated_at": timestamp,
            })
            .to_string();

            responses.push(
                self.publish_raw_event(HDBANK_PARTNER_EVENTS_TOPIC, key, timestamp, value)
                    .await?,
            );
        }

        Ok(responses)
    }

    pub async fn publish_hdbank_banking_transaction_events(
        &self,
        reqs: Vec<PublishBankingTransactionEventRequest>,
    ) -> Result<Vec<PublishEventResponse>, AppError> {
        let mut responses = Vec::with_capacity(reqs.len());

        for req in reqs {
            let timestamp = req.posted_at;
            let key = req.transaction_id.clone();
            let value = serde_json::json!({
                "event_type": "banking_transaction_recorded",
                "transaction_id": req.transaction_id,
                "customer_id": req.user_id,
                "accountId": req.account_id,
                "posted_at": timestamp,
                "transaction_type": req.transaction_type,
                "channel": req.channel,
                "merchant_category": req.merchant_category,
                "amount": Self::parse_f64("amount", &req.amount)?,
                "currency": req.currency,
                "source_bank": req.source_bank,
                "destination_bank": req.destination_bank,
                "merchant_name": req.merchant_name,
                "balance_before": Self::parse_f64("balanceBefore", &req.balance_before)?,
                "balance_after": Self::parse_f64("balanceAfter", &req.balance_after)?,
                "city": req.city,
            })
            .to_string();

            responses.push(
                self.publish_raw_event(HDBANK_PARTNER_EVENTS_TOPIC, key, timestamp, value)
                    .await?,
            );
        }

        Ok(responses)
    }

    pub async fn publish_vietjetair_customer_events(
        &self,
        reqs: Vec<PublishVietjetairCustomerEventRequest>,
    ) -> Result<Vec<PublishEventResponse>, AppError> {
        let mut responses = Vec::with_capacity(reqs.len());

        for req in reqs {
            let timestamp = Utc::now();
            let key = req.user_id.clone();
            let value = serde_json::json!({
                "event_type": "customer_profile_updated",
                "customer_id": req.user_id,
                "customer_name": req.full_name,
                "city": req.city,
                "age": req.age,
                "customer_case": req.customer_case,
                "skyboss_tier": req.skyboss_tier,
                "vietjet_air_affinity_score": req.vietjet_air_affinity_score,
                "annual_flights": req.annual_flights,
                "ancillary_spend_score": req.ancillary_spend_score,
                "vietjet_air_since": req.vietjet_air_since,
                "has_hdbank_co_brand_card": req.has_hdbank_co_brand_card,
                "updated_at": timestamp,
            })
            .to_string();

            responses.push(
                self.publish_raw_event(VIETJETAIR_PARTNER_EVENTS_TOPIC, key, timestamp, value)
                    .await?,
            );
        }

        Ok(responses)
    }

    pub async fn publish_vietjetair_flight_ticket_events(
        &self,
        reqs: Vec<PublishFlightTicketEventRequest>,
    ) -> Result<Vec<PublishEventResponse>, AppError> {
        let mut responses = Vec::with_capacity(reqs.len());

        for req in reqs {
            let timestamp = req.booking_at;
            let key = req.ticket_id.clone();
            let value = serde_json::json!({
                "event_type": "flight_ticket_issued",
                "ticket_id": req.ticket_id,
                "customer_id": req.user_id,
                "booking_reference": req.booking_reference,
                "airline": req.airline,
                "flight_number": req.flight_number,
                "trip_type": req.trip_type,
                "origin_airport": req.origin_airport,
                "destination_airport": req.destination_airport,
                "booking_at": req.booking_at,
                "departure_at": req.departure_at,
                "return_departure_at": req.return_departure_at,
                "cabin_class": req.cabin_class,
                "passenger_count": req.passenger_count,
                "distance_km": req.distance_km,
                "flight_duration_minutes": req.flight_duration_minutes,
                "base_fare": Self::parse_f64("baseFare", &req.base_fare)?,
                "taxes": Self::parse_f64("taxes", &req.taxes)?,
                "total_price": Self::parse_f64("totalPrice", &req.total_price)?,
                "currency": req.currency,
                "baggage_kg": req.baggage_kg,
                "status": req.status,
                "city": req.city,
            })
            .to_string();

            responses.push(
                self.publish_raw_event(VIETJETAIR_PARTNER_EVENTS_TOPIC, key, timestamp, value)
                    .await?,
            );
        }

        Ok(responses)
    }

    pub async fn publish_vietjetair_flight_incident_events(
        &self,
        reqs: Vec<PublishFlightIncidentEventRequest>,
    ) -> Result<Vec<PublishEventResponse>, AppError> {
        let mut responses = Vec::with_capacity(reqs.len());

        for req in reqs {
            let timestamp = req.reported_at;
            let key = req.report_id.clone();
            let value = serde_json::json!({
                "event_type": "flight_incident_reported",
                "report_id": req.report_id,
                "customer_id": req.vietjet_customer_id,
                "ticket_id": req.ticket_id,
                "booking_reference": req.booking_reference,
                "airline": req.airline,
                "report_channel": req.report_channel,
                "incident_type": req.incident_type,
                "severity": req.severity,
                "issue_airport": req.issue_airport,
                "origin_airport": req.origin_airport,
                "destination_airport": req.destination_airport,
                "flight_number": req.flight_number,
                "departure_date": req.departure_date,
                "reported_at": req.reported_at,
                "status": req.status,
                "baggage_tag": req.baggage_tag,
                "delayed_minutes": req.delayed_minutes,
                "currency": req.currency,
                "city": req.city,
                "image_path": req.image_path,
            })
            .to_string();

            responses.push(
                self.publish_raw_event(VIETJETAIR_PARTNER_EVENTS_TOPIC, key, timestamp, value)
                    .await?,
            );
        }

        Ok(responses)
    }
}
