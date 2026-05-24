use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishHdbankCustomerEventRequest {
    pub user_id: String,
    pub full_name: String,
    pub city: String,
    pub age: i32,
    pub customer_case: String,
    pub customer_tier: String,
    pub hdbank_affinity_score: String,
    pub average_monthly_balance: String,
    pub credit_score_band: String,
    pub hdbank_since: String,
    pub has_vietjet_co_brand_card: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishVietjetairCustomerEventRequest {
    pub user_id: String,
    pub full_name: String,
    pub city: String,
    pub age: i32,
    pub customer_case: String,
    pub skyboss_tier: String,
    pub vietjet_air_affinity_score: String,
    pub annual_flights: i32,
    pub ancillary_spend_score: String,
    pub vietjet_air_since: String,
    pub has_hdbank_co_brand_card: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBankingTransactionEventRequest {
    pub transaction_id: String,
    pub user_id: String,
    pub account_id: String,
    pub posted_at: DateTime<Utc>,
    pub transaction_type: String,
    pub channel: String,
    pub merchant_category: String,
    pub amount: String,
    pub currency: String,
    pub source_bank: String,
    pub destination_bank: String,
    pub merchant_name: String,
    pub balance_before: String,
    pub balance_after: String,
    pub city: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishFlightTicketEventRequest {
    pub ticket_id: String,
    pub user_id: String,
    pub booking_reference: String,
    pub airline: String,
    pub flight_number: String,
    pub trip_type: String,
    pub origin_airport: String,
    pub destination_airport: String,
    pub booking_at: DateTime<Utc>,
    pub departure_at: DateTime<Utc>,
    pub return_departure_at: Option<DateTime<Utc>>,
    pub cabin_class: String,
    pub passenger_count: i32,
    pub distance_km: i32,
    pub flight_duration_minutes: i32,
    pub base_fare: String,
    pub taxes: String,
    pub total_price: String,
    pub currency: String,
    pub baggage_kg: i32,
    pub status: String,
    pub city: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishFlightIncidentEventRequest {
    pub report_id: String,
    pub vietjet_customer_id: String,
    pub ticket_id: String,
    pub booking_reference: String,
    pub airline: String,
    pub report_channel: String,
    pub incident_type: String,
    pub severity: String,
    pub issue_airport: String,
    pub origin_airport: String,
    pub destination_airport: String,
    pub flight_number: String,
    pub departure_date: String,
    pub reported_at: DateTime<Utc>,
    pub status: String,
    pub baggage_tag: String,
    pub delayed_minutes: i32,
    pub currency: String,
    pub city: String,
    pub image_path: String,
}

#[derive(Debug, Serialize)]
pub struct PublishEventResponse {
    pub topic: String,
    pub key: String,
    pub timestamp: DateTime<Utc>,
}
