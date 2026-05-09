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
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::Timeout => StatusCode::GATEWAY_TIMEOUT,
            AppError::QueryFailed(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(json!({"error": self.to_string()}))).into_response()
    }
}
