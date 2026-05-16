use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

use crate::{
    domain::entities::team::{AddMemberBody, CreateTeamBody},
    infrastructure::server::AppState,
};

pub async fn list_teams(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.team_service.list_teams().await {
        Ok(teams) => Json(serde_json::json!({ "teams": teams })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_team(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateTeamBody>,
) -> impl IntoResponse {
    match state.team_service.create_team(body).await {
        Ok(team) => (StatusCode::CREATED, Json(team)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match state.team_service.get_team(id).await {
        Ok(team) => Json(team).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_members(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
) -> impl IntoResponse {
    match state.team_service.list_members(team_id).await {
        Ok(members) => Json(serde_json::json!({ "members": members })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn add_member(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    Json(body): Json<AddMemberBody>,
) -> impl IntoResponse {
    match state.team_service.add_member(team_id, body).await {
        Ok(member) => (StatusCode::CREATED, Json(member)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn remove_member(
    State(state): State<Arc<AppState>>,
    Path((team_id, user_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    match state.team_service.remove_member(team_id, user_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => err.into_response(),
    }
}
