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
    domain::entities::table::*,
    infrastructure::server::AppState,
};

#[derive(Deserialize)]
pub struct ListParams {
    pub catalog_name: String,
    pub schema_name: String,
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

pub async fn create_table(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Json(body): Json<CreateTable>,
) -> Result<impl IntoResponse, AppError> {
    let table = state.table_service.create_table(&principal, body).await?;
    Ok(Json(table))
}

pub async fn list_tables(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .table_service
        .list_tables(&principal, &params.catalog_name, &params.schema_name, params.max_results, params.page_token)
        .await?;
    Ok(Json(response))
}

pub async fn get_table(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let table = state.table_service.get_table(&principal, &full_name).await?;
    Ok(Json(table))
}

pub async fn delete_table(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    state.table_service.delete_table(&principal, &full_name).await?;
    Ok(Json(serde_json::json!({})))
}
