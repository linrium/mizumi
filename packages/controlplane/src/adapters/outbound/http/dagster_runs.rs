use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::dagster_client::{REPO_LOCATION, REPO_NAME, gql_post};

const RUNS_QUERY: &str = r#"
query ListRuns($filter: RunsFilter, $cursor: String, $limit: Int) {
  runsOrError(filter: $filter, cursor: $cursor, limit: $limit) {
    __typename
    ... on Runs {
      results {
        runId
        jobName
        status
        tags { key value }
        creationTime
        startTime
        endTime
        rootRunId
        parentRunId
        assetSelection { path }
        stats {
          ... on RunStatsSnapshot {
            stepsSucceeded
            stepsFailed
          }
        }
      }
    }
    ... on InvalidPipelineRunsFilterError { message }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize, Serialize, Clone)]
pub struct RunTag {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize)]
pub(crate) struct GqlAssetKey {
    pub(crate) path: Vec<String>,
}

const RUN_QUERY: &str = r#"
query GetRun($runId: ID!) {
  runOrError(runId: $runId) {
    __typename
    ... on Run {
      runId
      jobName
      status
      tags { key value }
      creationTime
      startTime
      endTime
      runConfigYaml
      rootRunId
      parentRunId
      canTerminate
      assetSelection { path }
      stats {
        ... on RunStatsSnapshot {
          stepsSucceeded
          stepsFailed
          enqueuedTime
          launchTime
          startTime
          endTime
        }
      }
    }
    ... on RunNotFoundError { message }
    ... on PythonError { message }
  }
}"#;

const LAUNCH_RUN_MUTATION: &str = r#"
mutation LaunchRun($executionParams: ExecutionParams!) {
  launchRun(executionParams: $executionParams) {
    __typename
    ... on LaunchRunSuccess {
      run { runId jobName status }
    }
    ... on PipelineNotFoundError { message }
    ... on InvalidStepError { invalidStepKey }
    ... on RunConflict { message }
    ... on PythonError { message }
  }
}"#;

pub(crate) const ASSET_REQUIRED_KEYS_QUERY: &str = r#"
query AssetRequiredKeys($assetKeys: [AssetKeyInput!]!) {
  assetNodeAdditionalRequiredKeys(assetKeys: $assetKeys) { path }
}"#;

#[derive(Deserialize)]
pub(crate) struct AssetRequiredKeysData {
    #[serde(rename = "assetNodeAdditionalRequiredKeys")]
    pub(crate) additional_required_keys: Vec<GqlAssetKey>,
}

pub(crate) const MATERIALIZE_ASSET_MUTATION: &str = r#"
mutation MaterializeAsset($executionParams: ExecutionParams!) {
  launchRun(executionParams: $executionParams) {
    __typename
    ... on LaunchRunSuccess {
      run { runId jobName status }
    }
    ... on PipelineNotFoundError { message }
    ... on InvalidStepError { invalidStepKey }
    ... on RunConflict { message }
    ... on PythonError { message }
  }
}"#;

pub(crate) const LAUNCH_PIPELINE_EXECUTION_MUTATION: &str = r#"
mutation LaunchPipelineExecution($executionParams: ExecutionParams!) {
  launchPipelineExecution(executionParams: $executionParams) {
    __typename
    ... on LaunchRunSuccess {
      run { id pipelineName status }
    }
    ... on PipelineNotFoundError { message }
    ... on InvalidSubsetError { message }
    ... on RunConfigValidationInvalid { errors { message } }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize)]
pub(crate) struct LaunchPipelineExecutionData {
    #[serde(rename = "launchPipelineExecution")]
    pub(crate) launch_pipeline_execution: GqlLaunchPipelineResult,
}

#[derive(Deserialize)]
pub(crate) struct GqlLaunchPipelineResult {
    #[serde(rename = "__typename")]
    pub(crate) typename: String,
    pub(crate) run: Option<GqlLaunchedPipelineRun>,
    pub(crate) message: Option<String>,
    pub(crate) errors: Option<Vec<GqlValidationError>>,
}

#[derive(Deserialize)]
pub(crate) struct GqlLaunchedPipelineRun {
    pub(crate) id: String,
    #[serde(rename = "pipelineName")]
    pub(crate) pipeline_name: String,
    pub(crate) status: String,
}

#[derive(Deserialize)]
pub(crate) struct GqlValidationError {
    pub(crate) message: String,
}

const TERMINATE_RUN_MUTATION: &str = r#"
mutation TerminateRun($runId: String!) {
  terminateRun(runId: $runId) {
    __typename
    ... on TerminateRunSuccess { run { runId status } }
    ... on TerminateRunFailure { message }
    ... on RunNotFoundError { message }
    ... on UnauthorizedError { message }
    ... on PythonError { message }
  }
}"#;

#[derive(Deserialize)]
struct RunsData {
    #[serde(rename = "runsOrError")]
    runs_or_error: GqlRunsOrError,
}

#[derive(Deserialize)]
struct GqlRunsOrError {
    #[serde(rename = "__typename")]
    typename: String,
    results: Option<Vec<GqlRun>>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct RunData {
    #[serde(rename = "runOrError")]
    run_or_error: GqlRunOrError,
}

#[derive(Deserialize)]
struct GqlRunOrError {
    #[serde(rename = "__typename")]
    typename: String,
    #[serde(flatten)]
    run: Option<GqlRun>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlRun {
    #[serde(rename = "runId")]
    run_id: String,
    #[serde(rename = "jobName", default)]
    job_name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    tags: Vec<RunTag>,
    #[serde(rename = "creationTime")]
    creation_time: Option<f64>,
    #[serde(rename = "startTime")]
    start_time: Option<f64>,
    #[serde(rename = "endTime")]
    end_time: Option<f64>,
    #[serde(rename = "runConfigYaml")]
    run_config_yaml: Option<String>,
    #[serde(rename = "rootRunId")]
    root_run_id: Option<String>,
    #[serde(rename = "parentRunId")]
    parent_run_id: Option<String>,
    #[serde(rename = "canTerminate")]
    can_terminate: Option<bool>,
    #[serde(rename = "assetSelection")]
    asset_selection: Option<Vec<GqlAssetKey>>,
    stats: Option<GqlRunStats>,
}

#[derive(Deserialize)]
struct GqlRunStats {
    #[serde(rename = "stepsSucceeded")]
    steps_succeeded: Option<i64>,
    #[serde(rename = "stepsFailed")]
    steps_failed: Option<i64>,
    #[serde(rename = "enqueuedTime")]
    enqueued_time: Option<f64>,
    #[serde(rename = "launchTime")]
    launch_time: Option<f64>,
    #[serde(rename = "startTime")]
    start_time: Option<f64>,
    #[serde(rename = "endTime")]
    end_time: Option<f64>,
}

#[derive(Serialize)]
pub struct RunsResponse {
    pub runs: Vec<Run>,
}

#[derive(Serialize)]
pub struct Run {
    pub run_id: String,
    pub job_name: String,
    pub status: String,
    pub tags: Vec<RunTag>,
    pub creation_time: Option<f64>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_config_yaml: Option<String>,
    pub root_run_id: Option<String>,
    pub parent_run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_terminate: Option<bool>,
    pub asset_selection: Vec<Vec<String>>,
    pub stats: Option<RunStats>,
}

#[derive(Serialize)]
pub struct RunStats {
    pub steps_succeeded: Option<i64>,
    pub steps_failed: Option<i64>,
    pub enqueued_time: Option<f64>,
    pub launch_time: Option<f64>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

fn gql_run_to_run(r: GqlRun) -> Run {
    Run {
        run_id: r.run_id,
        job_name: r.job_name.unwrap_or_default(),
        status: r.status.unwrap_or_default(),
        tags: r.tags,
        creation_time: r.creation_time,
        start_time: r.start_time,
        end_time: r.end_time,
        run_config_yaml: r.run_config_yaml,
        root_run_id: r.root_run_id,
        parent_run_id: r.parent_run_id,
        can_terminate: r.can_terminate,
        asset_selection: r
            .asset_selection
            .unwrap_or_default()
            .into_iter()
            .map(|k| k.path)
            .collect(),
        stats: r.stats.map(|s| RunStats {
            steps_succeeded: s.steps_succeeded,
            steps_failed: s.steps_failed,
            enqueued_time: s.enqueued_time,
            launch_time: s.launch_time,
            start_time: s.start_time,
            end_time: s.end_time,
        }),
    }
}

#[derive(Deserialize)]
pub struct ListRunsParams {
    pub status: Option<String>,
    pub job_name: Option<String>,
    pub limit: Option<i32>,
    pub cursor: Option<String>,
}

pub async fn list_runs(Query(params): Query<ListRunsParams>) -> impl IntoResponse {
    let filter = {
        let mut f = serde_json::Map::new();
        if let Some(status) = &params.status {
            f.insert("statuses".into(), json!([status.to_uppercase()]));
        }
        if let Some(job) = &params.job_name {
            f.insert("pipelineName".into(), json!(job));
        }
        if f.is_empty() {
            json!(null)
        } else {
            Value::Object(f)
        }
    };

    let vars = json!({
        "filter": filter,
        "cursor": params.cursor,
        "limit": params.limit.unwrap_or(20),
    });

    match gql_post::<RunsData>(RUNS_QUERY, vars).await {
        Ok(data) => {
            let r = data.runs_or_error;
            if r.typename != "Runs" {
                let msg = r
                    .message
                    .unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                return (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response();
            }
            let runs = r
                .results
                .unwrap_or_default()
                .into_iter()
                .map(gql_run_to_run)
                .collect();
            Json(RunsResponse { runs }).into_response()
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

pub async fn get_run(Path(run_id): Path<String>) -> impl IntoResponse {
    match gql_post::<RunData>(RUN_QUERY, json!({ "runId": run_id })).await {
        Ok(data) => {
            let r = data.run_or_error;
            match r.typename.as_str() {
                "Run" => {
                    if let Some(run) = r.run {
                        Json(gql_run_to_run(run)).into_response()
                    } else {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "error": "missing run data" })),
                        )
                            .into_response()
                    }
                }
                "RunNotFoundError" => (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": r.message.unwrap_or_default() })),
                )
                    .into_response(),
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

#[derive(Deserialize)]
pub struct LaunchRunRequest {
    pub job_name: String,
    #[serde(default)]
    pub run_config: Value,
    #[serde(default)]
    pub tags: Vec<RunTag>,
}

#[derive(Deserialize)]
pub(crate) struct LaunchRunData {
    #[serde(rename = "launchRun")]
    pub(crate) launch_run: GqlLaunchRunResult,
}

#[derive(Deserialize)]
pub(crate) struct GqlLaunchRunResult {
    #[serde(rename = "__typename")]
    pub(crate) typename: String,
    pub(crate) run: Option<GqlLaunchedRun>,
    pub(crate) message: Option<String>,
    #[serde(rename = "invalidStepKey")]
    pub(crate) invalid_step_key: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct GqlLaunchedRun {
    #[serde(rename = "runId")]
    pub(crate) run_id: String,
    #[serde(rename = "jobName")]
    pub(crate) job_name: String,
    pub(crate) status: String,
}

#[derive(Serialize)]
pub struct LaunchRunResponse {
    pub run_id: String,
    pub job_name: String,
    pub status: String,
}

pub async fn launch_run(Json(req): Json<LaunchRunRequest>) -> impl IntoResponse {
    let tags: Vec<Value> = req
        .tags
        .iter()
        .map(|t| json!({ "key": t.key, "value": t.value }))
        .collect();
    let vars = json!({
        "executionParams": {
            "selector": {
                "repositoryLocationName": REPO_LOCATION,
                "repositoryName": REPO_NAME,
                "jobName": req.job_name,
            },
            "runConfigData": req.run_config,
            "executionMetadata": { "tags": tags },
        }
    });

    match gql_post::<LaunchRunData>(LAUNCH_RUN_MUTATION, vars).await {
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

#[derive(Deserialize)]
struct TerminateRunData {
    #[serde(rename = "terminateRun")]
    terminate_run: GqlTerminateRunResult,
}

#[derive(Deserialize)]
struct GqlTerminateRunResult {
    #[serde(rename = "__typename")]
    typename: String,
    run: Option<GqlTerminatedRun>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlTerminatedRun {
    #[serde(rename = "runId")]
    run_id: String,
    status: String,
}

pub async fn terminate_run(Path(run_id): Path<String>) -> impl IntoResponse {
    match gql_post::<TerminateRunData>(TERMINATE_RUN_MUTATION, json!({ "runId": run_id })).await {
        Ok(data) => {
            let r = data.terminate_run;
            match r.typename.as_str() {
                "TerminateRunSuccess" => {
                    if let Some(run) = r.run {
                        Json(json!({ "run_id": run.run_id, "status": run.status })).into_response()
                    } else {
                        StatusCode::NO_CONTENT.into_response()
                    }
                }
                "RunNotFoundError" => (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": r.message.unwrap_or_default() })),
                )
                    .into_response(),
                "TerminateRunFailure" | "UnauthorizedError" => (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": r.message.unwrap_or_default() })),
                )
                    .into_response(),
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
