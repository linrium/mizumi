use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
