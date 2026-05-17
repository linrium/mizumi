use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    domain::entities::permission::{
        BulkApproveBody, CreatePermissionRequestBody, UpdateRequestStatusBody,
    },
    infrastructure::{auth::KeycloakClaims, server::AppState},
};

#[derive(Deserialize)]
pub struct ListQuery {
    pub resource: Option<String>,
    pub status: Option<String>,
    pub search: Option<String>,
    #[serde(default)]
    pub all: bool,
}

pub async fn list_requests(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Query(params): Query<ListQuery>,
) -> impl IntoResponse {
    let viewer_id = if params.all {
        None
    } else {
        match Uuid::parse_str(&claims.sub) {
            Ok(id) => Some(id),
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        }
    };
    match state
        .permission_service
        .list_requests(
            params.resource.as_deref(),
            params.status.as_deref(),
            params.search.as_deref(),
            viewer_id,
        )
        .await
    {
        Ok(requests) => Json(serde_json::json!({ "requests": requests })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_request(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreatePermissionRequestBody>,
) -> impl IntoResponse {
    match state.permission_service.create_request(body).await {
        Ok(request) => (StatusCode::CREATED, Json(request)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_request(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match state.permission_service.get_request(id).await {
        Ok(request) => Json(request).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn update_request_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateRequestStatusBody>,
) -> impl IntoResponse {
    match state
        .permission_service
        .update_request_status(id, body)
        .await
    {
        Ok(request) => Json(request).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn bulk_approve(
    State(state): State<Arc<AppState>>,
    Json(body): Json<BulkApproveBody>,
) -> impl IntoResponse {
    match state.permission_service.bulk_approve(body).await {
        Ok(requests) => Json(serde_json::json!({ "updated": requests })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_policy_templates(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.permission_service.list_policy_templates().await {
        Ok(templates) => Json(serde_json::json!({ "templates": templates })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_blast_radius(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.permission_service.list_blast_radius().await {
        Ok(previews) => Json(serde_json::json!({ "previews": previews })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_time_bound_grants(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.permission_service.list_time_bound_grants().await {
        Ok(grants) => Json(serde_json::json!({ "grants": grants })).into_response(),
        Err(err) => err.into_response(),
    }
}
