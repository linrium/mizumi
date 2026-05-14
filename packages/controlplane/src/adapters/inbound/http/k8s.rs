use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;

use crate::{
    domain::{entities::query::QueryRequest, error::AppError},
    infrastructure::server::AppState,
};

pub async fn run_query(
    State(state): State<Arc<AppState>>,
    Json(req): Json<QueryRequest>,
) -> Result<Json<crate::domain::entities::query::QueryResponse>, AppError> {
    Ok(Json(state.k8s_service.run_query(req).await?))
}

pub async fn create_session(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.k8s_service.create_session().await {
        Ok(response) => (StatusCode::CREATED, Json(response)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_sessions(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(state.k8s_service.list_sessions()).into_response()
}

pub async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.k8s_service.delete_session(&id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(AppError::NotFound) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "session not found" })),
        )
            .into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn session_query(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<QueryRequest>,
) -> impl IntoResponse {
    match state.k8s_service.session_query(&id, req).await {
        Ok(response) => Json(response).into_response(),
        Err(AppError::NotFound) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "session not found" })),
        )
            .into_response(),
        Err(err) => err.into_response(),
    }
}
