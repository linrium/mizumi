use crate::{
    adapters::inbound::http::error::AppError, domain::entities::model::*,
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
pub struct ListModelsParams {
    pub catalog_name: String,
    pub schema_name: String,
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct ListVersionsParams {
    pub max_results: Option<i32>,
    pub page_token: Option<String>,
}

pub async fn create_registered_model(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Json(body): Json<CreateRegisteredModel>,
) -> Result<impl IntoResponse, AppError> {
    let model = state
        .model_service
        .create_registered_model(&principal, body)
        .await?;
    Ok(Json(model))
}

pub async fn list_registered_models(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Query(params): Query<ListModelsParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .model_service
        .list_registered_models(
            &principal,
            &params.catalog_name,
            &params.schema_name,
            params.max_results,
            params.page_token,
        )
        .await?;
    Ok(Json(response))
}

pub async fn get_registered_model(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let model = state
        .model_service
        .get_registered_model(&principal, &full_name)
        .await?;
    Ok(Json(model))
}

pub async fn update_registered_model(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
    Json(body): Json<UpdateRegisteredModel>,
) -> Result<impl IntoResponse, AppError> {
    let model = state
        .model_service
        .update_registered_model(&principal, &full_name, body)
        .await?;
    Ok(Json(model))
}

pub async fn delete_registered_model(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    state
        .model_service
        .delete_registered_model(&principal, &full_name)
        .await?;
    Ok(Json(serde_json::json!({})))
}

pub async fn create_model_version(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
    Json(mut body): Json<CreateModelVersion>,
) -> Result<impl IntoResponse, AppError> {
    let parts: Vec<&str> = full_name.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AppError(
            crate::domain::error::DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.model, got: {}",
                full_name
            )),
        ));
    }
    body.catalog_name = parts[0].to_string();
    body.schema_name = parts[1].to_string();
    body.model_name = parts[2].to_string();
    let version = state
        .model_service
        .create_model_version(&principal, body)
        .await?;
    Ok(Json(version))
}

pub async fn list_model_versions(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path(full_name): Path<String>,
    Query(params): Query<ListVersionsParams>,
) -> Result<impl IntoResponse, AppError> {
    let response = state
        .model_service
        .list_model_versions(
            &principal,
            &full_name,
            params.max_results,
            params.page_token,
        )
        .await?;
    Ok(Json(response))
}

pub async fn get_model_version(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path((full_name, version)): Path<(String, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let mv = state
        .model_service
        .get_model_version(&principal, &full_name, version)
        .await?;
    Ok(Json(mv))
}

pub async fn update_model_version(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path((full_name, version)): Path<(String, i64)>,
    Json(body): Json<UpdateModelVersion>,
) -> Result<impl IntoResponse, AppError> {
    let mv = state
        .model_service
        .update_model_version(&principal, &full_name, version, body)
        .await?;
    Ok(Json(mv))
}

pub async fn delete_model_version(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path((full_name, version)): Path<(String, i64)>,
) -> Result<impl IntoResponse, AppError> {
    state
        .model_service
        .delete_model_version(&principal, &full_name, version)
        .await?;
    Ok(Json(serde_json::json!({})))
}
