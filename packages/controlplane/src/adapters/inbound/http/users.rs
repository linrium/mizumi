use std::sync::Arc;

use axum::{Extension, Json, extract::State, response::IntoResponse};
use uuid::Uuid;

use crate::infrastructure::{auth::KeycloakClaims, server::AppState};

pub async fn me(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
) -> impl IntoResponse {
    let id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return axum::http::StatusCode::UNAUTHORIZED.into_response(),
    };
    match state.user_service.get_by_id(id).await {
        Ok(user) => Json(user).into_response(),
        Err(err) => err.into_response(),
    }
}
