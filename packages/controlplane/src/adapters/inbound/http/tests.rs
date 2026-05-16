use std::sync::Arc;

use axum::{Json, extract::State, http::StatusCode};

use crate::{
    domain::{
        entities::test_event::{
            PublishEventResponse, PublishHdbankCustomerEventRequest,
            PublishHdbankPaymentEventRequest, PublishVietjetairBookingEventRequest,
            PublishVietjetairCustomerEventRequest, PublishVietjetairFlightEventRequest,
        },
        error::AppError,
    },
    infrastructure::server::AppState,
};

pub async fn publish_hdbank_payment_event(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PublishHdbankPaymentEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_hdbank_payment_event(req)
                .await?,
        ),
    ))
}

pub async fn publish_hdbank_customer_event(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PublishHdbankCustomerEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_hdbank_customer_event(req)
                .await?,
        ),
    ))
}

pub async fn publish_vietjetair_customer_event(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PublishVietjetairCustomerEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_vietjetair_customer_event(req)
                .await?,
        ),
    ))
}

pub async fn publish_vietjetair_flight_event(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PublishVietjetairFlightEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_vietjetair_flight_event(req)
                .await?,
        ),
    ))
}

pub async fn publish_vietjetair_booking_event(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PublishVietjetairBookingEventRequest>,
) -> Result<(StatusCode, Json<PublishEventResponse>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_vietjetair_booking_event(req)
                .await?,
        ),
    ))
}
