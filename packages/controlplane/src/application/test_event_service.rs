use std::time::Duration;

use chrono::Utc;
use rdkafka::{
    producer::{FutureProducer, FutureRecord},
    util::Timeout,
};
use tracing::info;

use crate::domain::{
    entities::test_event::{
        PublishEventResponse, PublishHdbankCustomerEventRequest, PublishHdbankPaymentEventRequest,
        PublishVietjetairBookingEventRequest, PublishVietjetairCustomerEventRequest,
        PublishVietjetairFlightEventRequest,
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

    pub async fn publish_hdbank_payment_event(
        &self,
        req: PublishHdbankPaymentEventRequest,
    ) -> Result<PublishEventResponse, AppError> {
        let timestamp = req.payment_timestamp.unwrap_or_else(Utc::now);
        let key = req.payment_event_id.clone();
        let value = serde_json::json!({
            "event_type": "card_transaction_posted",
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

        self.publish_raw_event(HDBANK_PARTNER_EVENTS_TOPIC, key, timestamp, value)
            .await
    }

    pub async fn publish_hdbank_customer_event(
        &self,
        req: PublishHdbankCustomerEventRequest,
    ) -> Result<PublishEventResponse, AppError> {
        let timestamp = req.updated_at.unwrap_or_else(Utc::now);
        let key = req.customer_id.clone();
        let value = serde_json::json!({
            "event_type": "customer_profile_updated",
            "customer_id": req.customer_id,
            "customer_name": req.customer_name,
            "segment_name": req.segment_name,
            "kyc_status": req.kyc_status,
            "preferred_channel": req.preferred_channel,
            "updated_at": timestamp,
        })
        .to_string();

        self.publish_raw_event(HDBANK_PARTNER_EVENTS_TOPIC, key, timestamp, value)
            .await
    }

    pub async fn publish_vietjetair_customer_event(
        &self,
        req: PublishVietjetairCustomerEventRequest,
    ) -> Result<PublishEventResponse, AppError> {
        let timestamp = req.updated_at.unwrap_or_else(Utc::now);
        let key = req.customer_id.clone();
        let value = serde_json::json!({
            "event_type": "customer_profile_updated",
            "customer_id": req.customer_id,
            "customer_name": req.customer_name,
            "membership_tier": req.membership_tier,
            "home_airport": req.home_airport,
            "email_opt_in": req.email_opt_in,
            "updated_at": timestamp,
        })
        .to_string();

        self.publish_raw_event(VIETJETAIR_PARTNER_EVENTS_TOPIC, key, timestamp, value)
            .await
    }

    pub async fn publish_vietjetair_flight_event(
        &self,
        req: PublishVietjetairFlightEventRequest,
    ) -> Result<PublishEventResponse, AppError> {
        let timestamp = req.scheduled_departure_time;
        let key = req.flight_id.clone();
        let value = serde_json::json!({
            "event_type": "flight_schedule_updated",
            "flight_id": req.flight_id,
            "flight_number": req.flight_number,
            "route_code": req.route_code,
            "departure_airport": req.departure_airport,
            "arrival_airport": req.arrival_airport,
            "scheduled_departure_time": req.scheduled_departure_time,
            "aircraft_type": req.aircraft_type,
        })
        .to_string();

        self.publish_raw_event(VIETJETAIR_PARTNER_EVENTS_TOPIC, key, timestamp, value)
            .await
    }

    pub async fn publish_vietjetair_booking_event(
        &self,
        req: PublishVietjetairBookingEventRequest,
    ) -> Result<PublishEventResponse, AppError> {
        let timestamp = req.booking_timestamp.unwrap_or_else(Utc::now);
        let key = req.booking_id.clone();
        let value = serde_json::json!({
            "event_type": "booking_confirmed",
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

        self.publish_raw_event(VIETJETAIR_PARTNER_EVENTS_TOPIC, key, timestamp, value)
            .await
    }
}
