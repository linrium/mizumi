use std::sync::Arc;

use axum::{Json, extract::State, http::StatusCode};

use crate::{
    domain::{
        entities::test_event::{
            PublishBankingTransactionEventRequest, PublishEventResponse,
            PublishFlightIncidentEventRequest, PublishFlightTicketEventRequest,
            PublishHdbankCustomerEventRequest, PublishVietjetairCustomerEventRequest,
        },
        error::AppError,
    },
    infrastructure::server::AppState,
};

pub async fn publish_hdbank_customer_events(
    State(state): State<Arc<AppState>>,
    Json(reqs): Json<Vec<PublishHdbankCustomerEventRequest>>,
) -> Result<(StatusCode, Json<Vec<PublishEventResponse>>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_hdbank_customer_events(reqs)
                .await?,
        ),
    ))
}

pub async fn publish_hdbank_banking_transaction_events(
    State(state): State<Arc<AppState>>,
    Json(reqs): Json<Vec<PublishBankingTransactionEventRequest>>,
) -> Result<(StatusCode, Json<Vec<PublishEventResponse>>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_hdbank_banking_transaction_events(reqs)
                .await?,
        ),
    ))
}

pub async fn publish_vietjetair_customer_events(
    State(state): State<Arc<AppState>>,
    Json(reqs): Json<Vec<PublishVietjetairCustomerEventRequest>>,
) -> Result<(StatusCode, Json<Vec<PublishEventResponse>>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_vietjetair_customer_events(reqs)
                .await?,
        ),
    ))
}

pub async fn publish_vietjetair_flight_ticket_events(
    State(state): State<Arc<AppState>>,
    Json(reqs): Json<Vec<PublishFlightTicketEventRequest>>,
) -> Result<(StatusCode, Json<Vec<PublishEventResponse>>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_vietjetair_flight_ticket_events(reqs)
                .await?,
        ),
    ))
}

pub async fn publish_vietjetair_flight_incident_events(
    State(state): State<Arc<AppState>>,
    Json(reqs): Json<Vec<PublishFlightIncidentEventRequest>>,
) -> Result<(StatusCode, Json<Vec<PublishEventResponse>>), AppError> {
    Ok((
        StatusCode::ACCEPTED,
        Json(
            state
                .test_event_service
                .publish_vietjetair_flight_incident_events(reqs)
                .await?,
        ),
    ))
}
