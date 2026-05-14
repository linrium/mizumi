use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Extension,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use crate::{
    adapters::inbound::http::error::AppError,
    domain::entities::volume::*,
    infrastructure::server::AppState,
};

#[derive(Deserialize)]
pub struct ListParams {
    pub catalog_name: String,
    pub schema_name: String,
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

pub async fn create_volume(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Json(body): Json<CreateVolume>,
) -> Result<impl IntoResponse, AppError> {
    let volume = state.volume_service.create_volume(&principal, body).await?;
    Ok(Json(volume))
}

pub async fn list_volumes(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .volume_service
        .list_volumes(&principal, &params.catalog_name, &params.schema_name, params.max_results, params.page_token)
        .await?;
    Ok(Json(response))
}

pub async fn get_volume(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let volume = state.volume_service.get_volume(&principal, &full_name).await?;
    Ok(Json(volume))
}

pub async fn update_volume(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
    Json(body): Json<UpdateVolume>,
) -> Result<impl IntoResponse, AppError> {
    let volume = state.volume_service.update_volume(&principal, &full_name, body).await?;
    Ok(Json(volume))
}

pub async fn delete_volume(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    state.volume_service.delete_volume(&principal, &full_name).await?;
    Ok(Json(serde_json::json!({})))
}
