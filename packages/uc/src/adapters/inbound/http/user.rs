use crate::{
    adapters::inbound::http::error::AppError,
    domain::entities::user::{CreateUser, ScimListResponse, ScimUser, UpdateUser},
    infrastructure::server::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct ListParams {
    /// SCIM startIndex is 1-based
    #[serde(rename = "startIndex")]
    pub start_index: Option<usize>,
    pub count: Option<usize>,
    pub filter: Option<String>,
}

/// POST /api/1.0/unity-control/scim2/Users
pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ScimUser>,
) -> Result<impl IntoResponse, AppError> {
    let email = body
        .primary_email()
        .ok_or_else(|| {
            AppError::from(crate::domain::error::DomainError::InvalidArgument(
                "User must have an email address (set in 'emails' or 'userName')".to_string(),
            ))
        })?
        .to_string();

    let name = body.display_name.unwrap_or_else(|| email.clone());

    let cmd = CreateUser {
        name,
        email,
        external_id: body.external_id,
        picture_url: None,
        active: body.active,
    };

    let user = state.user_service.create_user(cmd).await?;
    Ok((StatusCode::CREATED, Json(ScimUser::from(user))))
}

/// GET /api/1.0/unity-control/scim2/Users
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, AppError> {
    // SCIM startIndex is 1-based; convert to 0-based offset
    let start_index = params.start_index.unwrap_or(1).saturating_sub(1);
    let users = state
        .user_service
        .list_users(Some(start_index), params.count)
        .await?;
    let response = ScimListResponse::new(users, params.start_index.unwrap_or(1));
    Ok(Json(response))
}

/// GET /api/1.0/unity-control/scim2/Users/:id
pub async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user = state.user_service.get_user(&id).await?;
    Ok(Json(ScimUser::from(user)))
}

/// PUT /api/1.0/unity-control/scim2/Users/:id
pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<ScimUser>,
) -> Result<impl IntoResponse, AppError> {
    let cmd = UpdateUser {
        name: body.display_name,
        active: Some(body.active),
        external_id: body.external_id,
    };
    let user = state.user_service.update_user(&id, cmd).await?;
    Ok(Json(ScimUser::from(user)))
}

/// DELETE /api/1.0/unity-control/scim2/Users/:id
pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    state.user_service.delete_user(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}
