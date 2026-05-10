use std::sync::OnceLock;

use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(reqwest::Client::new)
}

fn dagster_graphql_url() -> String {
    std::env::var("DAGSTER_BASE_URL").unwrap_or_else(|_| {
        "http://dagster-dagster-webserver.dagster.svc.cluster.local:80".to_string()
    }) + "/graphql"
}

const REPO_LOCATION: &str = "mizumi";
const REPO_NAME: &str = "__repository__";

// ---- GraphQL helpers ----

#[derive(Deserialize)]
struct GqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

async fn gql_post<T: for<'de> Deserialize<'de>>(
    query: &str,
    variables: Value,
) -> Result<T, (StatusCode, Value)> {
    let body = json!({ "query": query, "variables": variables });
    let resp = client()
        .post(dagster_graphql_url())
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Dagster request failed: {e}");
            (StatusCode::BAD_GATEWAY, json!({ "error": e.to_string() }))
        })?;

    let gql: GqlResponse<T> = resp.json().await.map_err(|e| {
        tracing::error!("Failed to parse Dagster response: {e}");
        (StatusCode::BAD_GATEWAY, json!({ "error": "invalid response from Dagster" }))
    })?;

    if let Some(errors) = gql.errors {
        let msg = errors.iter().map(|e| e.message.as_str()).collect::<Vec<_>>().join("; ");
        tracing::error!("Dagster GraphQL errors: {msg}");
        return Err((StatusCode::BAD_GATEWAY, json!({ "error": msg })));
    }

    gql.data.ok_or_else(|| (StatusCode::BAD_GATEWAY, json!({ "error": "empty response from Dagster" })))
}

// ---- Shared types ----

#[derive(Deserialize, Serialize, Clone)]
pub struct RunTag {
    pub key: String,
    pub value: String,
}

// ---- Assets (records) ----

const ASSETS_QUERY: &str = r#"
query {
  assetRecordsOrError {
    ... on AssetRecordConnection {
      cursor
      assets {
        id
        key { path }
      }
    }
  }
}"#;

#[derive(Deserialize)]
struct AssetsData {
    #[serde(rename = "assetRecordsOrError")]
    asset_records_or_error: GqlAssetRecordConnection,
}

#[derive(Deserialize)]
struct GqlAssetRecordConnection {
    cursor: Option<String>,
    assets: Option<Vec<GqlAssetRecord>>,
}

#[derive(Deserialize)]
struct GqlAssetRecord {
    id: String,
    key: GqlAssetKey,
}

#[derive(Deserialize)]
struct GqlAssetKey {
    path: Vec<String>,
}

#[derive(Serialize)]
pub struct AssetsResponse {
    pub assets: Vec<AssetRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Serialize)]
pub struct AssetRecord {
    pub id: String,
    pub path: Vec<String>,
}

pub async fn list_assets() -> impl IntoResponse {
    match gql_post::<AssetsData>(ASSETS_QUERY, json!({})).await {
        Ok(data) => {
            let conn = data.asset_records_or_error;
            let assets = conn
                .assets
                .unwrap_or_default()
                .into_iter()
                .map(|a| AssetRecord { id: a.id, path: a.key.path })
                .collect();
            Json(AssetsResponse { assets, cursor: conn.cursor }).into_response()
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Asset nodes ----

const ASSET_NODES_QUERY: &str = r#"
query {
  assetNodes {
    assetKey { path }
    computeKind
    description
    groupName
    isObservable
    isExecutable
    jobNames
    dependencyKeys { path }
    dependedByKeys { path }
    staleStatus
    assetMaterializations(limit: 1) {
      timestamp
      runId
    }
  }
}"#;

const ASSET_NODE_QUERY: &str = r#"
query GetAssetNode($assetKey: AssetKeyInput!) {
  assetNodeOrError(assetKey: $assetKey) {
    __typename
    ... on AssetNode {
      assetKey { path }
      computeKind
      description
      groupName
      isObservable
      isExecutable
      jobNames
      dependencyKeys { path }
      dependedByKeys { path }
      staleStatus
      staleCauses {
        key { path }
        reason
        dependency { path }
        category
      }
      assetMaterializations(limit: 10) {
        timestamp
        runId
        tags { key value }
        metadataEntries {
          label
          __typename
          ... on TextMetadataEntry { text }
          ... on FloatMetadataEntry { floatValue }
          ... on IntMetadataEntry { intValue }
          ... on BoolMetadataEntry { boolValue }
          ... on JsonMetadataEntry { jsonString }
          ... on PathMetadataEntry { path }
          ... on UrlMetadataEntry { url }
          ... on MarkdownMetadataEntry { mdStr }
        }
      }
    }
    ... on AssetNotFoundError { message }
  }
}"#;

#[derive(Deserialize)]
struct AssetNodesData {
    #[serde(rename = "assetNodes")]
    asset_nodes: Vec<GqlAssetNode>,
}

#[derive(Deserialize)]
struct AssetNodeData {
    #[serde(rename = "assetNodeOrError")]
    asset_node_or_error: GqlAssetNodeOrError,
}

#[derive(Deserialize)]
struct GqlAssetNodeOrError {
    #[serde(rename = "__typename")]
    typename: String,
    #[serde(flatten)]
    node: Option<GqlAssetNodeDetail>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GqlAssetNode {
    #[serde(rename = "assetKey")]
    asset_key: GqlAssetKey,
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
    #[serde(rename = "dependencyKeys")]
    dependency_keys: Vec<GqlAssetKey>,
    #[serde(rename = "dependedByKeys")]
    depended_by_keys: Vec<GqlAssetKey>,
    #[serde(rename = "staleStatus")]
    stale_status: Option<String>,
    #[serde(rename = "assetMaterializations")]
    asset_materializations: Vec<GqlLastMaterialization>,
}

#[derive(Deserialize)]
struct GqlAssetNodeDetail {
    #[serde(rename = "assetKey")]
    asset_key: GqlAssetKey,
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
    #[serde(rename = "dependencyKeys")]
    dependency_keys: Vec<GqlAssetKey>,
    #[serde(rename = "dependedByKeys")]
    depended_by_keys: Vec<GqlAssetKey>,
    #[serde(rename = "staleStatus")]
    stale_status: Option<String>,
    #[serde(rename = "staleCauses", default)]
    stale_causes: Vec<GqlStaleCause>,
    #[serde(rename = "assetMaterializations", default)]
    asset_materializations: Vec<GqlMaterialization>,
}

#[derive(Deserialize)]
struct GqlStaleCause {
    key: GqlAssetKey,
    reason: String,
    dependency: Option<GqlAssetKey>,
    category: String,
}

#[derive(Deserialize)]
struct GqlMaterialization {
    timestamp: String,
    #[serde(rename = "runId")]
    run_id: String,
    #[serde(default)]
    tags: Vec<RunTag>,
    #[serde(rename = "metadataEntries", default)]
    metadata_entries: Vec<GqlMetadataEntry>,
}

#[derive(Deserialize)]
struct GqlMetadataEntry {
    label: String,
    #[serde(rename = "__typename")]
    typename: String,
    // scalar fields — only one will be populated per entry
    text: Option<String>,
    #[serde(rename = "floatValue")]
    float_value: Option<f64>,
    #[serde(rename = "intValue")]
    int_value: Option<i64>,
    #[serde(rename = "boolValue")]
    bool_value: Option<bool>,
    #[serde(rename = "jsonString")]
    json_string: Option<String>,
    path: Option<String>,
    url: Option<String>,
    #[serde(rename = "mdStr")]
    md_str: Option<String>,
}

#[derive(Deserialize)]
struct GqlLastMaterialization {
    timestamp: String,
    #[serde(rename = "runId")]
    run_id: String,
}

#[derive(Serialize)]
pub struct AssetNodesResponse {
    pub nodes: Vec<AssetNode>,
}

#[derive(Serialize)]
pub struct AssetNode {
    pub path: Vec<String>,
    pub compute_kind: Option<String>,
    pub description: Option<String>,
    pub group_name: Option<String>,
    pub is_observable: bool,
    pub is_executable: bool,
    pub job_names: Vec<String>,
    pub dependency_keys: Vec<Vec<String>>,
    pub depended_by_keys: Vec<Vec<String>>,
    pub stale_status: Option<String>,
    pub last_materialization: Option<LastMaterialization>,
}

#[derive(Serialize)]
pub struct AssetNodeDetail {
    pub path: Vec<String>,
    pub compute_kind: Option<String>,
    pub description: Option<String>,
    pub group_name: Option<String>,
    pub is_observable: bool,
    pub is_executable: bool,
    pub job_names: Vec<String>,
    pub dependency_keys: Vec<Vec<String>>,
    pub depended_by_keys: Vec<Vec<String>>,
    pub stale_status: Option<String>,
    pub stale_causes: Vec<StaleCause>,
    pub materializations: Vec<Materialization>,
}

#[derive(Serialize)]
pub struct StaleCause {
    pub key: Vec<String>,
    pub reason: String,
    pub dependency: Option<Vec<String>>,
    pub category: String,
}

#[derive(Serialize)]
pub struct Materialization {
    pub timestamp: String,
    pub run_id: String,
    pub tags: Vec<RunTag>,
    pub metadata: Vec<MetadataEntry>,
}

#[derive(Serialize)]
pub struct MetadataEntry {
    pub label: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub value: Value,
}

#[derive(Serialize)]
pub struct LastMaterialization {
    pub timestamp: String,
    pub run_id: String,
}

fn gql_metadata_to_entry(e: GqlMetadataEntry) -> MetadataEntry {
    let (entry_type, value) = match e.typename.as_str() {
        "TextMetadataEntry" => ("text".into(), json!(e.text)),
        "FloatMetadataEntry" => ("float".into(), json!(e.float_value)),
        "IntMetadataEntry" => ("int".into(), json!(e.int_value)),
        "BoolMetadataEntry" => ("bool".into(), json!(e.bool_value)),
        "JsonMetadataEntry" => ("json".into(), json!(e.json_string)),
        "PathMetadataEntry" => ("path".into(), json!(e.path)),
        "UrlMetadataEntry" => ("url".into(), json!(e.url)),
        "MarkdownMetadataEntry" => ("markdown".into(), json!(e.md_str)),
        other => (other.to_string(), Value::Null),
    };
    MetadataEntry { label: e.label, entry_type, value }
}

pub async fn get_asset_node(Path(path): Path<String>) -> impl IntoResponse {
    let key_path: Vec<String> = path.split('/').map(str::to_string).collect();
    let vars = json!({ "assetKey": { "path": key_path } });

    match gql_post::<AssetNodeData>(ASSET_NODE_QUERY, vars).await {
        Ok(data) => {
            let r = data.asset_node_or_error;
            match r.typename.as_str() {
                "AssetNode" => {
                    if let Some(n) = r.node {
                        let detail = AssetNodeDetail {
                            path: n.asset_key.path,
                            compute_kind: n.compute_kind,
                            description: n.description,
                            group_name: n.group_name,
                            is_observable: n.is_observable,
                            is_executable: n.is_executable,
                            job_names: n.job_names,
                            dependency_keys: n.dependency_keys.into_iter().map(|k| k.path).collect(),
                            depended_by_keys: n.depended_by_keys.into_iter().map(|k| k.path).collect(),
                            stale_status: n.stale_status,
                            stale_causes: n.stale_causes.into_iter().map(|c| StaleCause {
                                key: c.key.path,
                                reason: c.reason,
                                dependency: c.dependency.map(|d| d.path),
                                category: c.category,
                            }).collect(),
                            materializations: n.asset_materializations.into_iter().map(|m| Materialization {
                                timestamp: m.timestamp,
                                run_id: m.run_id,
                                tags: m.tags,
                                metadata: m.metadata_entries.into_iter().map(gql_metadata_to_entry).collect(),
                            }).collect(),
                        };
                        Json(detail).into_response()
                    } else {
                        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "missing node data" }))).into_response()
                    }
                }
                "AssetNotFoundError" => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": r.message.unwrap_or_default() }))).into_response()
                }
                _ => {
                    let msg = r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                    (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response()
                }
            }
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

pub async fn list_asset_nodes() -> impl IntoResponse {
    match gql_post::<AssetNodesData>(ASSET_NODES_QUERY, json!({})).await {
        Ok(data) => {
            let nodes = data
                .asset_nodes
                .into_iter()
                .map(|n| AssetNode {
                    path: n.asset_key.path,
                    compute_kind: n.compute_kind,
                    description: n.description,
                    group_name: n.group_name,
                    is_observable: n.is_observable,
                    is_executable: n.is_executable,
                    job_names: n.job_names,
                    dependency_keys: n.dependency_keys.into_iter().map(|k| k.path).collect(),
                    depended_by_keys: n.depended_by_keys.into_iter().map(|k| k.path).collect(),
                    stale_status: n.stale_status,
                    last_materialization: n.asset_materializations.into_iter().next().map(|m| {
                        LastMaterialization { timestamp: m.timestamp, run_id: m.run_id }
                    }),
                })
                .collect();
            Json(AssetNodesResponse { nodes }).into_response()
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Runs ----

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
    #[serde(rename = "jobName")]
    job_name: String,
    status: String,
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
        job_name: r.job_name,
        status: r.status,
        tags: r.tags,
        creation_time: r.creation_time,
        start_time: r.start_time,
        end_time: r.end_time,
        run_config_yaml: r.run_config_yaml,
        root_run_id: r.root_run_id,
        parent_run_id: r.parent_run_id,
        can_terminate: r.can_terminate,
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
        if f.is_empty() { json!(null) } else { Value::Object(f) }
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
                let msg = r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                return (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response();
            }
            let runs = r.results.unwrap_or_default().into_iter().map(gql_run_to_run).collect();
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
                        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "missing run data" }))).into_response()
                    }
                }
                "RunNotFoundError" => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": r.message.unwrap_or_default() }))).into_response()
                }
                _ => {
                    let msg = r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename));
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
struct LaunchRunData {
    #[serde(rename = "launchRun")]
    launch_run: GqlLaunchRunResult,
}

#[derive(Deserialize)]
struct GqlLaunchRunResult {
    #[serde(rename = "__typename")]
    typename: String,
    run: Option<GqlLaunchedRun>,
    message: Option<String>,
    #[serde(rename = "invalidStepKey")]
    invalid_step_key: Option<String>,
}

#[derive(Deserialize)]
struct GqlLaunchedRun {
    #[serde(rename = "runId")]
    run_id: String,
    #[serde(rename = "jobName")]
    job_name: String,
    status: String,
}

#[derive(Serialize)]
pub struct LaunchRunResponse {
    pub run_id: String,
    pub job_name: String,
    pub status: String,
}

pub async fn launch_run(Json(req): Json<LaunchRunRequest>) -> impl IntoResponse {
    let tags: Vec<Value> = req.tags.iter().map(|t| json!({ "key": t.key, "value": t.value })).collect();
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
                        (StatusCode::CREATED, Json(json!(LaunchRunResponse {
                            run_id: run.run_id,
                            job_name: run.job_name,
                            status: run.status,
                        }))).into_response()
                    } else {
                        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "missing run data" }))).into_response()
                    }
                }
                "PipelineNotFoundError" => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": r.message.unwrap_or_default() }))).into_response()
                }
                "InvalidStepError" => {
                    let key = r.invalid_step_key.unwrap_or_default();
                    (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("invalid step: {key}") }))).into_response()
                }
                _ => {
                    let msg = r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename));
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
                "RunNotFoundError" => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": r.message.unwrap_or_default() }))).into_response()
                }
                "TerminateRunFailure" | "UnauthorizedError" => {
                    (StatusCode::BAD_REQUEST, Json(json!({ "error": r.message.unwrap_or_default() }))).into_response()
                }
                _ => {
                    let msg = r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename));
                    (StatusCode::BAD_GATEWAY, Json(json!({ "error": msg }))).into_response()
                }
            }
        }
        Err((status, body)) => (status, Json(body)).into_response(),
    }
}

// ---- Jobs ----

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
                    loc.location_or_load_error
                        .into_iter()
                        .flat_map(move |rl| {
                            let loc_name = loc_name.clone();
                            rl.repositories.unwrap_or_default().into_iter().flat_map(move |repo| {
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
    #[serde(rename = "scheduleState")]
    schedule_state: Option<GqlScheduleState>,
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
    pub status: Option<String>,
    pub last_tick: Option<ScheduleTick>,
}

#[derive(Serialize)]
pub struct ScheduleTick {
    pub timestamp: f64,
    pub status: String,
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
                let msg = r.message.unwrap_or_else(|| format!("unexpected type: {}", r.typename));
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
