use crate::{
    adapters::inbound::http::error::AppError, domain::entities::function::*,
    infrastructure::server::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct ListParams {
    pub catalog_name: String,
    pub schema_name: String,
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

pub async fn create_function(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Json(body): Json<CreateFunctionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let function = state
        .function_service
        .create_function(&principal, body.function_info)
        .await?;
    Ok(Json(function))
}

pub async fn list_functions(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .function_service
        .list_functions(
            &principal,
            &params.catalog_name,
            &params.schema_name,
            params.max_results,
            params.page_token,
        )
        .await?;
    Ok(Json(response))
}

pub async fn get_function(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let function = state
        .function_service
        .get_function(&principal, &full_name)
        .await?;
    Ok(Json(function))
}

pub async fn delete_function(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    state
        .function_service
        .delete_function(&principal, &full_name)
        .await?;
    Ok(Json(serde_json::json!({})))
}
