use crate::{
    adapters::inbound::http::error::AppError,
    domain::{error::DomainError, permissions::UpdatePermissions},
    infrastructure::server::AppState,
};
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Extension, Json,
};
use serde::Serialize;
use std::sync::Arc;

pub async fn get_permissions(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path((securable_type_str, full_name)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    let securable_type = securable_type_str
        .parse()
        .map_err(|e: String| AppError::from(DomainError::InvalidArgument(e)))?;
    let result = state
        .permission_service
        .get_permissions(&principal, securable_type, &full_name)
        .await?;
    Ok(Json(result))
}

#[derive(Serialize)]
struct EffectivePrivilegesResponse {
    privileges: Vec<String>,
}

pub async fn get_effective_privileges(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path((securable_type_str, full_name)): Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    let securable_type = securable_type_str
        .parse()
        .map_err(|e: String| AppError::from(DomainError::InvalidArgument(e)))?;
    let privileges = state
        .permission_service
        .get_effective_privileges(&principal, securable_type, &full_name)
        .await?;
    Ok(Json(EffectivePrivilegesResponse {
        privileges: privileges.into_iter().map(|p| p.to_string()).collect(),
    }))
}

pub async fn update_permissions(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<String>,
    Path((securable_type_str, full_name)): Path<(String, String)>,
    Json(body): Json<UpdatePermissions>,
) -> Result<impl IntoResponse, AppError> {
    let securable_type = securable_type_str
        .parse()
        .map_err(|e: String| AppError::from(DomainError::InvalidArgument(e)))?;
    let result = state
        .permission_service
        .update_permissions(&principal, securable_type, &full_name, body)
        .await?;
    Ok(Json(result))
}
