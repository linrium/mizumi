use axum::{
    Json,
    extract::{Path, Query},
    response::{IntoResponse, Response},
};

use crate::adapters::outbound::http::dagster::{
    self, LaunchRunRequest, ListRunsParams, ListScheduleAssetSelectionsParams,
    MaterializeManyRequest, RunEventsParams, TickHistoryParams,
};

#[derive(Clone, Default)]
pub struct DagsterService;

impl DagsterService {
    pub async fn list_assets(&self) -> Response {
        dagster::list_assets().await.into_response()
    }

    pub async fn list_asset_nodes(&self) -> Response {
        dagster::list_asset_nodes().await.into_response()
    }

    pub async fn get_asset_node(&self, path: String) -> Response {
        dagster::get_asset_node(Path(path)).await.into_response()
    }

    pub async fn get_asset_status(&self, path: String) -> Response {
        dagster::get_asset_status(Path(path)).await.into_response()
    }

    pub async fn materialize_asset(&self, path: String) -> Response {
        dagster::materialize_asset(Path(path)).await.into_response()
    }

    pub async fn materialize_many_assets(&self, request: MaterializeManyRequest) -> Response {
        dagster::materialize_many_assets(Json(request))
            .await
            .into_response()
    }

    pub async fn list_runs(&self, params: ListRunsParams) -> Response {
        dagster::list_runs(Query(params)).await.into_response()
    }

    pub async fn launch_run(&self, request: LaunchRunRequest) -> Response {
        dagster::launch_run(Json(request)).await.into_response()
    }

    pub async fn get_run(&self, run_id: String) -> Response {
        dagster::get_run(Path(run_id)).await.into_response()
    }

    pub async fn terminate_run(&self, run_id: String) -> Response {
        dagster::terminate_run(Path(run_id)).await.into_response()
    }

    pub async fn get_run_events(&self, run_id: String, params: RunEventsParams) -> Response {
        dagster::get_run_events(Path(run_id), Query(params))
            .await
            .into_response()
    }

    pub async fn list_jobs(&self) -> Response {
        dagster::list_jobs().await.into_response()
    }

    pub async fn list_schedules(&self) -> Response {
        dagster::list_schedules().await.into_response()
    }

    pub async fn list_schedule_asset_selections(
        &self,
        params: ListScheduleAssetSelectionsParams,
    ) -> Response {
        dagster::list_schedule_asset_selections(Query(params))
            .await
            .into_response()
    }

    pub async fn get_schedule_asset_selection(&self, name: String) -> Response {
        dagster::get_schedule_asset_selection(Path(name))
            .await
            .into_response()
    }

    pub async fn get_schedule_tick_history(
        &self,
        name: String,
        params: TickHistoryParams,
    ) -> Response {
        dagster::get_schedule_tick_history(Path(name), Query(params))
            .await
            .into_response()
    }
}
