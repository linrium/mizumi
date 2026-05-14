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
    domain::entities::catalog::*,
    infrastructure::server::AppState,
};

#[derive(Deserialize)]
pub struct ListParams {
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteParams {
    pub force: Option<bool>,
}

pub async fn create_catalog(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Json(body): Json<CreateCatalog>,
) -> Result<impl IntoResponse, AppError> {
    let catalog = state.catalog_service.create_catalog(&principal, body).await?;
    Ok(Json(catalog))
}

pub async fn list_catalogs(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .catalog_service
        .list_catalogs(&principal, params.max_results, params.page_token)
        .await?;
    Ok(Json(response))
}

pub async fn get_catalog(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let catalog = state.catalog_service.get_catalog(&principal, &name).await?;
    Ok(Json(catalog))
}

pub async fn update_catalog(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(name): Path<String>,
    Json(body): Json<UpdateCatalog>,
) -> Result<impl IntoResponse, AppError> {
    let catalog = state.catalog_service.update_catalog(&principal, &name, body).await?;
    Ok(Json(catalog))
}

pub async fn delete_catalog(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(name): Path<String>,
    Query(params): Query<DeleteParams>,
) -> Result<impl IntoResponse, AppError> {
    state
        .catalog_service
        .delete_catalog(&principal, &name, params.force.unwrap_or(false))
        .await?;
    Ok(Json(serde_json::json!({})))
}
