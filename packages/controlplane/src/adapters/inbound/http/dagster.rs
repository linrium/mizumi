use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    response::Response,
};

use crate::{
    adapters::outbound::http::dagster::{
        LaunchRunRequest, ListRunsParams, ListScheduleAssetSelectionsParams,
        MaterializeManyRequest, RunEventsParams, TickHistoryParams,
    },
    infrastructure::server::AppState,
};

pub async fn list_assets(State(state): State<Arc<AppState>>) -> Response {
    state.dagster_service.list_assets().await
}

pub async fn list_asset_nodes(State(state): State<Arc<AppState>>) -> Response {
    state.dagster_service.list_asset_nodes().await
}

pub async fn get_asset_node(
    State(state): State<Arc<AppState>>,
    Path(path): Path<String>,
) -> Response {
    state.dagster_service.get_asset_node(path).await
}

pub async fn get_asset_status(
    State(state): State<Arc<AppState>>,
    Path(path): Path<String>,
) -> Response {
    state.dagster_service.get_asset_status(path).await
}

pub async fn materialize_asset(
    State(state): State<Arc<AppState>>,
    Path(path): Path<String>,
) -> Response {
    state.dagster_service.materialize_asset(path).await
}

pub async fn materialize_many_assets(
    State(state): State<Arc<AppState>>,
    Json(request): Json<MaterializeManyRequest>,
) -> Response {
    state.dagster_service.materialize_many_assets(request).await
}

pub async fn list_runs(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListRunsParams>,
) -> Response {
    state.dagster_service.list_runs(params).await
}

pub async fn launch_run(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LaunchRunRequest>,
) -> Response {
    state.dagster_service.launch_run(request).await
}

pub async fn get_run(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
) -> Response {
    state.dagster_service.get_run(run_id).await
}

pub async fn terminate_run(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
) -> Response {
    state.dagster_service.terminate_run(run_id).await
}

pub async fn get_run_events(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<RunEventsParams>,
) -> Response {
    state.dagster_service.get_run_events(run_id, params).await
}

pub async fn list_jobs(State(state): State<Arc<AppState>>) -> Response {
    state.dagster_service.list_jobs().await
}

pub async fn list_schedules(State(state): State<Arc<AppState>>) -> Response {
    state.dagster_service.list_schedules().await
}

pub async fn list_schedule_asset_selections(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListScheduleAssetSelectionsParams>,
) -> Response {
    state
        .dagster_service
        .list_schedule_asset_selections(params)
        .await
}

pub async fn get_schedule_asset_selection(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Response {
    state.dagster_service.get_schedule_asset_selection(name).await
}

pub async fn get_schedule_tick_history(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Query(params): Query<TickHistoryParams>,
) -> Response {
    state.dagster_service.get_schedule_tick_history(name, params).await
}
