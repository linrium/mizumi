use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

use crate::{
    domain::entities::chat_thread::{CreateChatThreadBody, UpdateChatThreadBody},
    infrastructure::{auth::KeycloakClaims, server::AppState},
};

pub async fn list_threads(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
) -> impl IntoResponse {
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match state.chat_thread_service.list_threads(user_id).await {
        Ok(threads) => Json(serde_json::json!({ "threads": threads })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_thread(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Json(body): Json<CreateChatThreadBody>,
) -> impl IntoResponse {
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match state.chat_thread_service.create_thread(user_id, body).await {
        Ok(thread) => (StatusCode::CREATED, Json(thread)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_thread(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match state.chat_thread_service.get_thread(user_id, id).await {
        Ok(thread) => Json(thread).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn update_thread(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateChatThreadBody>,
) -> impl IntoResponse {
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match state
        .chat_thread_service
        .update_thread(user_id, id, body)
        .await
    {
        Ok(thread) => Json(thread).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn delete_thread(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    match state.chat_thread_service.delete_thread(user_id, id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => err.into_response(),
    }
}
