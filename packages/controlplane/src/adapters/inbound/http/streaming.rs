use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

use crate::{
    domain::entities::streaming::CreateStreamingJobRequest,
    infrastructure::server::AppState,
};

pub async fn list_streaming_jobs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.streaming_service.list_jobs().await {
        Ok(jobs) => Json(serde_json::json!({ "jobs": jobs })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_streaming_job(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateStreamingJobRequest>,
) -> impl IntoResponse {
    match state.streaming_service.create_job(req).await {
        Ok(job) => (StatusCode::CREATED, Json(job)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_streaming_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match state.streaming_service.get_job(id).await {
        Ok(job) => Json(job).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn delete_streaming_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match state.streaming_service.delete_job(id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_streaming_job_logs(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match state.streaming_service.get_job_logs(id).await {
        Ok(logs) => Json(logs).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn restart_streaming_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match state.streaming_service.restart_job(id).await {
        Ok(response) => Json(response).into_response(),
        Err(err) => err.into_response(),
    }
}
