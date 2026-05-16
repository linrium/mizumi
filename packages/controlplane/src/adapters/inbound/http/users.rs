use std::sync::Arc;

use axum::{Extension, Json, extract::State, response::IntoResponse};

use crate::{infrastructure::{auth::KeycloakClaims, server::AppState}};

pub async fn me(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
) -> impl IntoResponse {
    match state.user_service.get_by_id(&claims.sub).await {
        Ok(user) => Json(user).into_response(),
        Err(err) => err.into_response(),
    }
}
