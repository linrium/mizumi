use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::dagster_client::{REPO_LOCATION, REPO_NAME, gql_post};
use super::dagster_runs::{
    ASSET_REQUIRED_KEYS_QUERY, AssetRequiredKeysData, GqlAssetKey,
    LAUNCH_PIPELINE_EXECUTION_MUTATION, LaunchPipelineExecutionData, LaunchRunData,
    LaunchRunResponse, MATERIALIZE_ASSET_MUTATION,
};

const JOBS_QUERY: &str = r#"
query {
  workspaceOrError {
    ... on Workspace {
      locationEntries {
        name
        locationOrLoadError {
          ... on RepositoryLocation {
            name
            repositories {
              name
              jobs {
                name
                description
                tags { key value }
              }
            }
          }
        }
      }
    }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize, Serialize, Clone)]
pub struct RunTag {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize)]
struct JobsData {
    #[serde(rename = "workspaceOrError")]
    workspace_or_error: GqlWorkspaceOrError,
}

#[derive(Deserialize)]
struct GqlWorkspaceOrError {
    #[serde(rename = "locationEntries")]
    location_entries: Option<Vec<GqlLocationEntry>>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlLocationEntry {
    name: String,
    #[serde(rename = "locationOrLoadError")]
    location_or_load_error: Option<GqlRepoLocation>,
}

#[derive(Deserialize)]
struct GqlRepoLocation {
    repositories: Option<Vec<GqlRepository>>,
}

#[derive(Deserialize)]
struct GqlRepository {
    name: String,
    jobs: Vec<GqlJob>,
}

#[derive(Deserialize)]
struct GqlJob {
    name: String,
    description: Option<String>,
    #[serde(default)]
    tags: Vec<RunTag>,
}

#[derive(Serialize)]
pub struct JobsResponse {
    pub jobs: Vec<Job>,
}

#[derive(Serialize)]
pub struct Job {
    pub name: String,
    pub description: Option<String>,
    pub tags: Vec<RunTag>,
    pub location: String,
    pub repository: String,
}

pub async fn list_jobs() -> impl IntoResponse {
    match gql_post::<JobsData>(JOBS_QUERY, json!({})).await {
        Ok(data) => {
            if let Some(msg) = data.workspace_or_error.message {
                return (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response();
            }
            let jobs = data
                .workspace_or_error
                .location_entries
                .unwrap_or_default()
                .into_iter()
                .flat_map(|loc| {
                    let loc_name = loc.name.clone();
                    loc.location_or_load_error.into_iter().flat_map(move |rl| {
                        let loc_name = loc_name.clone();
                        rl.repositories
                            .unwrap_or_default()
                            .into_iter()
                            .flat_map(move |repo| {
                                let loc_name = loc_name.clone();
                                let repo_name = repo.name.clone();
                                repo.jobs.into_iter().map(move |j| Job {
                                    name: j.name,
                                    description: j.description,
                                    tags: j.tags,
                                    location: loc_name.clone(),
                                    repository: repo_name.clone(),
                                })
                            })
                    })
                })
                .collect();
            Json(JobsResponse { jobs }).into_response()
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Schedules ----

const SCHEDULES_QUERY: &str = r#"
query Schedules($selector: RepositorySelector!) {
  schedulesOrError(repositorySelector: $selector) {
    __typename
    ... on Schedules {
      results {
        name
        cronSchedule
        description
        executionTimezone
        defaultStatus
        pipelineName
        futureTicks(limit: 1) {
          results {
            timestamp
          }
        }
        scheduleState {
          status
          ticks(limit: 1) {
            timestamp
            status
          }
        }
      }
    }
    ... on RepositoryNotFoundError { message }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize)]
struct SchedulesData {
    #[serde(rename = "schedulesOrError")]
    schedules_or_error: GqlSchedulesOrError,
}

#[derive(Deserialize)]
struct GqlSchedulesOrError {
    #[serde(rename = "__typename")]
    typename: String,
    results: Option<Vec<GqlSchedule>>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlSchedule {
    name: String,
    #[serde(rename = "cronSchedule")]
    cron_schedule: String,
    description: Option<String>,
    #[serde(rename = "executionTimezone")]
    execution_timezone: Option<String>,
    #[serde(rename = "defaultStatus")]
    default_status: Option<String>,
    #[serde(rename = "pipelineName")]
    job_name: Option<String>,
    #[serde(rename = "futureTicks")]
    future_ticks: Option<GqlFutureTicks>,
    #[serde(rename = "scheduleState")]
    schedule_state: Option<GqlScheduleState>,
}

#[derive(Deserialize)]
struct GqlFutureTicks {
    results: Vec<GqlFutureTick>,
}

#[derive(Deserialize)]
struct GqlFutureTick {
    timestamp: f64,
}

#[derive(Deserialize)]
struct GqlScheduleState {
    status: String,
    #[serde(default)]
    ticks: Vec<GqlTick>,
}

#[derive(Deserialize)]
struct GqlTick {
    timestamp: f64,
    status: String,
}

#[derive(Serialize)]
pub struct SchedulesResponse {
    pub schedules: Vec<Schedule>,
}

#[derive(Serialize)]
pub struct Schedule {
    pub name: String,
    pub cron_schedule: String,
    pub description: Option<String>,
    pub execution_timezone: Option<String>,
    pub default_status: Option<String>,
    pub job_name: Option<String>,
    pub status: Option<String>,
    pub last_tick: Option<ScheduleTick>,
    pub next_tick: Option<f64>,
}

#[derive(Serialize)]
pub struct ScheduleTick {
    pub timestamp: f64,
    pub status: String,
}

// ---- Materialize asset(s) ----

#[derive(Deserialize)]
pub struct MaterializeManyRequest {
    pub paths: Vec<Vec<String>>,
}

pub async fn materialize_many_assets(Json(req): Json<MaterializeManyRequest>) -> impl IntoResponse {
    if req.paths.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "no assets specified" })),
        )
            .into_response();
    }

    let asset_selection: Vec<Value> = req.paths.iter().map(|p| json!({ "path": p })).collect();

    let vars = json!({
        "executionParams": {
            "mode": "default",
            "executionMetadata": { "tags": [{ "key": "dagster/from_ui", "value": "true" }] },
            "runConfigData": "{}",
            "selector": {
                "repositoryLocationName": REPO_LOCATION,
                "repositoryName": REPO_NAME,
                "pipelineName": "__ASSET_JOB",
                "assetSelection": asset_selection,
                "assetCheckSelection": [],
            },
        }
    });

    match gql_post::<LaunchPipelineExecutionData>(LAUNCH_PIPELINE_EXECUTION_MUTATION, vars).await {
        Ok(data) => {
            let r = data.launch_pipeline_execution;
            match r.typename.as_str() {
                "LaunchRunSuccess" => {
                    if let Some(run) = r.run {
                        (
                            StatusCode::CREATED,
                            Json(json!({ "run_id": run.id, "job_name": run.pipeline_name, "status": run.status })),
                        )
                            .into_response()
                    } else {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "error": "missing run data" })),
                        )
                            .into_response()
                    }
                }
                "RunConfigValidationInvalid" => {
                    let msg = r
                        .errors
                        .unwrap_or_default()
                        .iter()
                        .map(|e| e.message.as_str())
                        .collect::<Vec<_>>()
                        .join("; ");
                    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()
                }
                _ => {
                    let msg = r
                        .message
                        .unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                    (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response()
                }
            }
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

pub async fn materialize_asset(Path(path): Path<String>) -> impl IntoResponse {
    let key_path: Vec<String> = path.split('/').map(str::to_string).collect();

    // Resolve required neighbors (non-subsettable multi-assets must be launched together)
    let mut all_keys: Vec<Vec<String>> = vec![key_path.clone()];
    match gql_post::<AssetRequiredKeysData>(
        ASSET_REQUIRED_KEYS_QUERY,
        json!({ "assetKeys": [{ "path": key_path }] }),
    )
    .await
    {
        Ok(data) => {
            for k in data.additional_required_keys {
                all_keys.push(k.path);
            }
        }
        Err((status, body)) => return (status, Json(body)).into_response(),
    }

    let asset_selection: Vec<Value> = all_keys.iter().map(|p| json!({ "path": p })).collect();

    let vars = json!({
        "executionParams": {
            "selector": {
                "repositoryLocationName": REPO_LOCATION,
                "repositoryName": REPO_NAME,
                "jobName": "__ASSET_JOB",
                "assetSelection": asset_selection,
            },
            "runConfigData": {},
            "executionMetadata": { "tags": [] },
        }
    });

    match gql_post::<LaunchRunData>(MATERIALIZE_ASSET_MUTATION, vars).await {
        Ok(data) => {
            let r = data.launch_run;
            match r.typename.as_str() {
                "LaunchRunSuccess" => {
                    if let Some(run) = r.run {
                        (
                            StatusCode::CREATED,
                            Json(json!(LaunchRunResponse {
                                run_id: run.run_id,
                                job_name: run.job_name,
                                status: run.status,
                            })),
                        )
                            .into_response()
                    } else {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "error": "missing run data" })),
                        )
                            .into_response()
                    }
                }
                "PipelineNotFoundError" => (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": r.message.unwrap_or_default() })),
                )
                    .into_response(),
                "InvalidStepError" => {
                    let key = r.invalid_step_key.unwrap_or_default();
                    (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": format!("invalid step: {key}") })),
                    )
                        .into_response()
                }
                _ => {
                    let msg = r
                        .message
                        .unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                    (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response()
                }
            }
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Run events ----

const RUN_EVENTS_QUERY: &str = r#"
query RunEvents($runId: ID!, $afterCursor: String, $limit: Int) {
  logsForRun(runId: $runId, afterCursor: $afterCursor, limit: $limit) {
    __typename
    ... on EventConnection {
      cursor
      hasMore
      events {
        __typename
        ... on MessageEvent {
          timestamp
          message
          level
          stepKey
        }
        ... on ExecutionStepFailureEvent {
          error { message causes { message } }
        }
        ... on MaterializationEvent {
          timestamp
          stepKey
          assetKey { path }
          label
          description
        }
        ... on AssetMaterializationPlannedEvent {
          timestamp
          assetKey { path }
        }
      }
    }
    ... on RunNotFoundError { message }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize)]
struct RunEventsData {
    #[serde(rename = "logsForRun")]
    logs_for_run: GqlLogsForRun,
}

#[derive(Deserialize)]
struct GqlLogsForRun {
    #[serde(rename = "__typename")]
    typename: String,
    cursor: Option<String>,
    #[serde(rename = "hasMore")]
    has_more: Option<bool>,
    events: Option<Vec<GqlRunEvent>>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlRunEvent {
    #[serde(rename = "__typename")]
    typename: String,
    timestamp: Option<String>,
    message: Option<String>,
    level: Option<String>,
    #[serde(rename = "stepKey")]
    step_key: Option<String>,
    error: Option<GqlEventError>,
    #[serde(rename = "assetKey")]
    asset_key: Option<GqlAssetKey>,
    label: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct GqlEventError {
    message: String,
    #[serde(default)]
    causes: Vec<GqlErrorCause>,
}

#[derive(Deserialize)]
struct GqlErrorCause {
    message: String,
}

#[derive(Serialize)]
pub struct RunEventsResponse {
    pub events: Vec<RunEvent>,
    pub cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Serialize)]
pub struct RunEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: Option<String>,
    pub message: Option<String>,
    pub level: Option<String>,
    pub step_key: Option<String>,
    pub error: Option<String>,
    pub asset_key: Option<Vec<String>>,
    pub label: Option<String>,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct RunEventsParams {
    pub cursor: Option<String>,
    pub limit: Option<i32>,
}

pub async fn get_run_events(
    Path(run_id): Path<String>,
    Query(params): Query<RunEventsParams>,
) -> impl IntoResponse {
    let vars = json!({
        "runId": run_id,
        "afterCursor": params.cursor,
        "limit": params.limit.unwrap_or(500),
    });

    match gql_post::<RunEventsData>(RUN_EVENTS_QUERY, vars).await {
        Ok(data) => {
            let r = data.logs_for_run;
            match r.typename.as_str() {
                "EventConnection" => {
                    let events = r
                        .events
                        .unwrap_or_default()
                        .into_iter()
                        .map(|e| {
                            let error_msg = e.error.map(|err| {
                                let mut msg = err.message.clone();
                                for c in &err.causes {
                                    msg.push_str("\nCaused by: ");
                                    msg.push_str(&c.message);
                                }
                                msg
                            });
                            RunEvent {
                                event_type: e.typename,
                                timestamp: e.timestamp,
                                message: e.message,
                                level: e.level,
                                step_key: e.step_key,
                                error: error_msg,
                                asset_key: e.asset_key.map(|k| k.path),
                                label: e.label,
                                description: e.description,
                            }
                        })
                        .collect();
                    Json(RunEventsResponse {
                        events,
                        cursor: r.cursor,
                        has_more: r.has_more.unwrap_or(false),
                    })
                    .into_response()
                }
                _ => {
                    let msg = r
                        .message
                        .unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                    (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response()
                }
            }
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

pub async fn list_schedules() -> impl IntoResponse {
    let vars = json!({
        "selector": {
            "repositoryLocationName": REPO_LOCATION,
            "repositoryName": REPO_NAME,
        }
    });

    match gql_post::<SchedulesData>(SCHEDULES_QUERY, vars).await {
        Ok(data) => {
            let r = data.schedules_or_error;
            if r.typename != "Schedules" {
                let msg = r
                    .message
                    .unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                return (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response();
            }
            let schedules = r
                .results
                .unwrap_or_default()
                .into_iter()
                .map(|s| Schedule {
                    name: s.name,
                    cron_schedule: s.cron_schedule,
                    description: s.description,
                    execution_timezone: s.execution_timezone,
                    default_status: s.default_status,
                    job_name: s.job_name,
                    next_tick: s
                        .future_ticks
                        .and_then(|ft| ft.results.into_iter().next())
                        .map(|t| t.timestamp),
                    status: s.schedule_state.as_ref().map(|st| st.status.clone()),
                    last_tick: s.schedule_state.and_then(|st| {
                        st.ticks.into_iter().next().map(|t| ScheduleTick {
                            timestamp: t.timestamp,
                            status: t.status,
                        })
                    }),
                })
                .collect();
            Json(SchedulesResponse { schedules }).into_response()
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Schedule asset selections ----

const SCHEDULE_ASSET_SELECTION_QUERY: &str = r#"
query ScheduleAssetSelection($selector: ScheduleSelector!) {
  scheduleOrError(scheduleSelector: $selector) {
    __typename
    ... on Schedule {
      name
      assetSelection {
        assetSelectionString
        assets {
          key { path }
          definition {
            computeKind
            description
            groupName
            isObservable
            isExecutable
            jobNames
          }
        }
      }
    }
    ... on ScheduleNotFoundError { message }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize)]
struct ScheduleAssetSelectionData {
    #[serde(rename = "scheduleOrError")]
    schedule_or_error: GqlScheduleOrError,
}

#[derive(Deserialize)]
struct GqlScheduleOrError {
    #[serde(rename = "__typename")]
    typename: String,
    name: Option<String>,
    #[serde(rename = "assetSelection")]
    asset_selection: Option<GqlScheduleAssetSelection>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlScheduleAssetSelection {
    #[serde(rename = "assetSelectionString")]
    asset_selection_string: Option<String>,
    assets: Vec<GqlScheduleAsset>,
}

#[derive(Deserialize)]
struct GqlScheduleAsset {
    key: GqlAssetKey,
    definition: Option<GqlScheduleAssetDef>,
}

#[derive(Deserialize)]
struct GqlScheduleAssetDef {
    #[serde(rename = "computeKind")]
    compute_kind: Option<String>,
    description: Option<String>,
    #[serde(rename = "groupName")]
    group_name: Option<String>,
    #[serde(rename = "isObservable")]
    is_observable: bool,
    #[serde(rename = "isExecutable")]
    is_executable: bool,
    #[serde(rename = "jobNames")]
    job_names: Vec<String>,
}

#[derive(Serialize)]
pub struct ScheduleAssetSelectionResponse {
    pub schedule_name: String,
    pub asset_selection_string: Option<String>,
    pub assets: Vec<ScheduleAsset>,
}

#[derive(Serialize)]
pub struct ScheduleAsset {
    pub key: Vec<String>,
    pub compute_kind: Option<String>,
    pub description: Option<String>,
    pub group_name: Option<String>,
    pub is_observable: bool,
    pub is_executable: bool,
    pub job_names: Vec<String>,
}

fn gql_schedule_asset_to_schedule_asset(a: GqlScheduleAsset) -> ScheduleAsset {
    let def = a.definition;
    ScheduleAsset {
        key: a.key.path,
        compute_kind: def.as_ref().and_then(|d| d.compute_kind.clone()),
        description: def.as_ref().and_then(|d| d.description.clone()),
        group_name: def.as_ref().and_then(|d| d.group_name.clone()),
        is_observable: def.as_ref().map(|d| d.is_observable).unwrap_or(false),
        is_executable: def.as_ref().map(|d| d.is_executable).unwrap_or(false),
        job_names: def.map(|d| d.job_names).unwrap_or_default(),
    }
}

async fn fetch_schedule_asset_selection(
    schedule_name: &str,
) -> Result<ScheduleAssetSelectionResponse, (StatusCode, Value)> {
    let vars = json!({
        "selector": {
            "repositoryLocationName": REPO_LOCATION,
            "repositoryName": REPO_NAME,
            "scheduleName": schedule_name,
        }
    });
    let data = gql_post::<ScheduleAssetSelectionData>(SCHEDULE_ASSET_SELECTION_QUERY, vars).await?;
    let r = data.schedule_or_error;
    match r.typename.as_str() {
        "Schedule" => {
            let sel = r.asset_selection.unwrap_or(GqlScheduleAssetSelection {
                asset_selection_string: None,
                assets: vec![],
            });
            Ok(ScheduleAssetSelectionResponse {
                schedule_name: r.name.unwrap_or_else(|| schedule_name.to_string()),
                asset_selection_string: sel.asset_selection_string,
                assets: sel
                    .assets
                    .into_iter()
                    .map(gql_schedule_asset_to_schedule_asset)
                    .collect(),
            })
        }
        "ScheduleNotFoundError" => Err((
            StatusCode::NOT_FOUND,
            json!({ "error": r.message.unwrap_or_default() }),
        )),
        _ => Err((
            StatusCode::BAD_GATEWAY,
            json!({ "error": r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename)) }),
        )),
    }
}

pub async fn list_schedule_asset_selections(
    Query(params): Query<ListScheduleAssetSelectionsParams>,
) -> impl IntoResponse {
    let names = match &params.names {
        Some(s) if !s.is_empty() => s
            .split(',')
            .map(str::trim)
            .map(str::to_string)
            .collect::<Vec<_>>(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "names query param required" })),
            )
                .into_response();
        }
    };

    let results =
        futures::future::join_all(names.iter().map(|n| fetch_schedule_asset_selection(n))).await;

    let mut schedules = Vec::with_capacity(names.len());
    for (name, result) in names.iter().zip(results) {
        match result {
            Ok(r) => schedules.push(r),
            Err((_, body)) => {
                let msg = body
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown error");
                tracing::warn!("Failed to fetch asset selection for schedule {name}: {msg}");
            }
        }
    }
    Json(json!({ "schedules": schedules })).into_response()
}

#[derive(Deserialize)]
pub struct ListScheduleAssetSelectionsParams {
    pub names: Option<String>,
}

pub async fn get_schedule_asset_selection(Path(name): Path<String>) -> impl IntoResponse {
    match fetch_schedule_asset_selection(&name).await {
        Ok(r) => Json(r).into_response(),
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Tick history ----

const TICK_HISTORY_QUERY: &str = r#"
query TickHistory(
  $instigationSelector: InstigationSelector!
  $dayRange: Int
  $limit: Int
  $cursor: String
  $statuses: [InstigationTickStatus!]
  $beforeTimestamp: Float
  $afterTimestamp: Float
) {
  instigationStateOrError(instigationSelector: $instigationSelector) {
    __typename
    ... on InstigationState {
      id
      instigationType
      ticks(
        dayRange: $dayRange
        limit: $limit
        cursor: $cursor
        statuses: $statuses
        beforeTimestamp: $beforeTimestamp
        afterTimestamp: $afterTimestamp
      ) {
        id
        tickId
        status
        timestamp
        endTimestamp
        cursor
        instigationType
        skipReason
        requestedAssetMaterializationCount
        runIds
        runs { id status }
        originRunIds
        error { message stack }
        logKey
        dynamicPartitionsRequestResults {
          partitionsDefName
          partitionKeys
          skippedPartitionKeys
          type
        }
      }
    }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize)]
struct TickHistoryData {
    #[serde(rename = "instigationStateOrError")]
    instigation_state_or_error: GqlInstigationStateOrError,
}

#[derive(Deserialize)]
struct GqlInstigationStateOrError {
    #[serde(rename = "__typename")]
    typename: String,
    id: Option<String>,
    #[serde(rename = "instigationType")]
    instigation_type: Option<String>,
    ticks: Option<Vec<GqlHistoryTick>>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlHistoryTick {
    id: String,
    #[serde(rename = "tickId")]
    tick_id: Option<String>,
    status: String,
    timestamp: f64,
    #[serde(rename = "endTimestamp")]
    end_timestamp: Option<f64>,
    cursor: Option<String>,
    #[serde(rename = "instigationType")]
    instigation_type: Option<String>,
    #[serde(rename = "skipReason")]
    skip_reason: Option<String>,
    #[serde(rename = "requestedAssetMaterializationCount")]
    requested_asset_materialization_count: Option<i64>,
    #[serde(rename = "runIds", default)]
    run_ids: Vec<String>,
    #[serde(default)]
    runs: Vec<GqlTickRun>,
    #[serde(rename = "originRunIds", default)]
    origin_run_ids: Vec<String>,
    error: Option<GqlTickError>,
    #[serde(rename = "logKey")]
    log_key: Option<Vec<String>>,
    #[serde(rename = "dynamicPartitionsRequestResults", default)]
    dynamic_partitions_request_results: Vec<GqlDynamicPartitionsResult>,
}

#[derive(Deserialize)]
struct GqlTickRun {
    id: String,
    status: String,
}

#[derive(Deserialize)]
struct GqlTickError {
    message: String,
    #[serde(default)]
    stack: Vec<String>,
}

#[derive(Deserialize)]
struct GqlDynamicPartitionsResult {
    #[serde(rename = "partitionsDefName")]
    partitions_def_name: String,
    #[serde(rename = "partitionKeys", default)]
    partition_keys: Vec<String>,
    #[serde(rename = "skippedPartitionKeys", default)]
    skipped_partition_keys: Vec<String>,
    #[serde(rename = "type")]
    result_type: String,
}

#[derive(Serialize)]
pub struct TickHistoryResponse {
    pub id: String,
    pub instigation_type: Option<String>,
    pub ticks: Vec<HistoryTick>,
}

#[derive(Serialize)]
pub struct HistoryTick {
    pub id: String,
    pub tick_id: Option<String>,
    pub status: String,
    pub timestamp: f64,
    pub end_timestamp: Option<f64>,
    pub cursor: Option<String>,
    pub instigation_type: Option<String>,
    pub skip_reason: Option<String>,
    pub requested_asset_materialization_count: Option<i64>,
    pub run_ids: Vec<String>,
    pub runs: Vec<TickRun>,
    pub origin_run_ids: Vec<String>,
    pub error: Option<TickError>,
    pub log_key: Option<Vec<String>>,
    pub dynamic_partitions_request_results: Vec<DynamicPartitionsResult>,
}

#[derive(Serialize)]
pub struct TickRun {
    pub id: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct TickError {
    pub message: String,
    pub stack: Vec<String>,
}

#[derive(Serialize)]
pub struct DynamicPartitionsResult {
    pub partitions_def_name: String,
    pub partition_keys: Vec<String>,
    pub skipped_partition_keys: Vec<String>,
    pub result_type: String,
}

#[derive(Deserialize)]
pub struct TickHistoryParams {
    pub day_range: Option<i32>,
    pub limit: Option<i32>,
    pub cursor: Option<String>,
    pub statuses: Option<String>,
    pub before_timestamp: Option<f64>,
    pub after_timestamp: Option<f64>,
}

pub async fn get_schedule_tick_history(
    Path(name): Path<String>,
    Query(params): Query<TickHistoryParams>,
) -> impl IntoResponse {
    let statuses: Option<Vec<String>> = params
        .statuses
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.split(',').map(|v| v.trim().to_uppercase()).collect());

    let vars = json!({
        "instigationSelector": {
            "repositoryLocationName": REPO_LOCATION,
            "repositoryName": REPO_NAME,
            "name": name,
        },
        "dayRange": params.day_range,
        "limit": params.limit.unwrap_or(50),
        "cursor": params.cursor,
        "statuses": statuses,
        "beforeTimestamp": params.before_timestamp,
        "afterTimestamp": params.after_timestamp,
    });

    match gql_post::<TickHistoryData>(TICK_HISTORY_QUERY, vars).await {
        Ok(data) => {
            let r = data.instigation_state_or_error;
            match r.typename.as_str() {
                "InstigationState" => {
                    let ticks = r
                        .ticks
                        .unwrap_or_default()
                        .into_iter()
                        .map(|t| HistoryTick {
                            id: t.id,
                            tick_id: t.tick_id,
                            status: t.status,
                            timestamp: t.timestamp,
                            end_timestamp: t.end_timestamp,
                            cursor: t.cursor,
                            instigation_type: t.instigation_type,
                            skip_reason: t.skip_reason,
                            requested_asset_materialization_count: t
                                .requested_asset_materialization_count,
                            run_ids: t.run_ids,
                            runs: t
                                .runs
                                .into_iter()
                                .map(|r| TickRun {
                                    id: r.id,
                                    status: r.status,
                                })
                                .collect(),
                            origin_run_ids: t.origin_run_ids,
                            error: t.error.map(|e| TickError {
                                message: e.message,
                                stack: e.stack,
                            }),
                            log_key: t.log_key,
                            dynamic_partitions_request_results: t
                                .dynamic_partitions_request_results
                                .into_iter()
                                .map(|d| DynamicPartitionsResult {
                                    partitions_def_name: d.partitions_def_name,
                                    partition_keys: d.partition_keys,
                                    skipped_partition_keys: d.skipped_partition_keys,
                                    result_type: d.result_type,
                                })
                                .collect(),
                        })
                        .collect();
                    Json(TickHistoryResponse {
                        id: r.id.unwrap_or_default(),
                        instigation_type: r.instigation_type,
                        ticks,
                    })
                    .into_response()
                }
                _ => {
                    let msg = r
                        .message
                        .unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                    (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response()
                }
            }
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Asset live status ----

const ASSET_LATEST_INFO_QUERY: &str = r#"
query AssetLatestInfo($assetKeys: [AssetKeyInput!]!) {
  assetsLatestInfo(assetKeys: $assetKeys) {
    assetKey { path }
    latestRun {
      runId
      status
      startTime
      endTime
    }
    latestMaterialization {
      timestamp
      runId
    }
    unstartedRunIds
    inProgressRunIds
  }
}"#;

#[derive(Deserialize)]
struct AssetLatestInfoData {
    #[serde(rename = "assetsLatestInfo")]
    assets_latest_info: Vec<GqlAssetLatestInfo>,
}

#[derive(Deserialize)]
struct GqlAssetLatestInfo {
    #[serde(rename = "latestRun")]
    latest_run: Option<GqlLatestRun>,
    #[serde(rename = "latestMaterialization")]
    latest_materialization: Option<GqlLatestMatInfo>,
    #[serde(rename = "unstartedRunIds", default)]
    unstarted_run_ids: Vec<String>,
    #[serde(rename = "inProgressRunIds", default)]
    in_progress_run_ids: Vec<String>,
}

#[derive(Deserialize)]
struct GqlLatestRun {
    #[serde(rename = "runId")]
    run_id: String,
    status: String,
    #[serde(rename = "startTime")]
    start_time: Option<f64>,
    #[serde(rename = "endTime")]
    end_time: Option<f64>,
}

#[derive(Deserialize)]
struct GqlLatestMatInfo {
    timestamp: String,
    #[serde(rename = "runId")]
    run_id: String,
}

#[derive(Serialize)]
pub struct AssetStatusResponse {
    pub latest_run: Option<LatestRunInfo>,
    pub latest_materialization: Option<LatestMatInfo>,
    pub unstarted_run_ids: Vec<String>,
    pub in_progress_run_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct LatestRunInfo {
    pub run_id: String,
    pub status: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

#[derive(Serialize)]
pub struct LatestMatInfo {
    pub timestamp: String,
    pub run_id: String,
}

pub async fn get_asset_status(Path(path): Path<String>) -> impl IntoResponse {
    let key_path: Vec<String> = path.split('/').map(str::to_string).collect();
    let vars = json!({ "assetKeys": [{ "path": key_path }] });

    match gql_post::<AssetLatestInfoData>(ASSET_LATEST_INFO_QUERY, vars).await {
        Ok(data) => {
            let info = match data.assets_latest_info.into_iter().next() {
                Some(i) => i,
                None => {
                    return (
                        StatusCode::NOT_FOUND,
                        Json(json!({ "error": "asset not found" })),
                    )
                        .into_response();
                }
            };
            Json(AssetStatusResponse {
                latest_run: info.latest_run.map(|r| LatestRunInfo {
                    run_id: r.run_id,
                    status: r.status,
                    start_time: r.start_time,
                    end_time: r.end_time,
                }),
                latest_materialization: info.latest_materialization.map(|m| LatestMatInfo {
                    timestamp: m.timestamp,
                    run_id: m.run_id,
                }),
                unstarted_run_ids: info.unstarted_run_ids,
                in_progress_run_ids: info.in_progress_run_ids,
            })
            .into_response()
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}
