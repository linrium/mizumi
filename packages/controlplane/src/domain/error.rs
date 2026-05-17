use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("kubernetes error: {0}")]
    Kube(#[from] kube::Error),
    #[error("query failed: {0}")]
    QueryFailed(String),
    #[error("timed out waiting for job to complete")]
    Timeout,
    #[error("failed to parse result: {0}")]
    Parse(String),
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("kafka error: {0}")]
    Kafka(String),
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Conflict(String),
    #[error("session has expired or been terminated")]
    SessionDied(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::Timeout => StatusCode::GATEWAY_TIMEOUT,
            AppError::QueryFailed(_) => StatusCode::BAD_REQUEST,
            AppError::NotFound | AppError::SessionDied(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}
