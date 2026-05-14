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
    domain::entities::schema::*,
    infrastructure::server::AppState,
};

#[derive(Deserialize)]
pub struct ListParams {
    pub catalog_name: String,
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteParams {
    pub force: Option<bool>,
}

pub async fn create_schema(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Json(body): Json<CreateSchema>,
) -> Result<impl IntoResponse, AppError> {
    let schema = state.schema_service.create_schema(&principal, body).await?;
    Ok(Json(schema))
}

pub async fn list_schemas(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .schema_service
        .list_schemas(&principal, &params.catalog_name, params.max_results, params.page_token)
        .await?;
    Ok(Json(response))
}

pub async fn get_schema(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let schema = state.schema_service.get_schema(&principal, &full_name).await?;
    Ok(Json(schema))
}

pub async fn update_schema(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
    Json(body): Json<UpdateSchema>,
) -> Result<impl IntoResponse, AppError> {
    let schema = state.schema_service.update_schema(&principal, &full_name, body).await?;
    Ok(Json(schema))
}

pub async fn delete_schema(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
    Query(params): Query<DeleteParams>,
) -> Result<impl IntoResponse, AppError> {
    state
        .schema_service
        .delete_schema(&principal, &full_name, params.force.unwrap_or(false))
        .await?;
    Ok(Json(serde_json::json!({})))
}
