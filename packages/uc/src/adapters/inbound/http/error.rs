use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use crate::domain::error::DomainError;

pub struct AppError(pub DomainError);

impl From<DomainError> for AppError {
    fn from(e: DomainError) -> Self {
        Self(e)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match self.0 {
            DomainError::NotFound(m) => (StatusCode::NOT_FOUND, m),
            DomainError::AlreadyExists(m) => (StatusCode::CONFLICT, m),
            DomainError::InvalidArgument(m) => (StatusCode::BAD_REQUEST, m),
            DomainError::PreconditionFailed(m) => (StatusCode::PRECONDITION_FAILED, m),
            DomainError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
            DomainError::Forbidden(m) => (StatusCode::FORBIDDEN, m),
        };
        (
            status,
            Json(serde_json::json!({
                "error_code": status.as_u16(),
                "message": msg
            })),
        )
            .into_response()
    }
}
