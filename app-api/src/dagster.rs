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
    std::env::var("DAGSTER_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_string())
        + "/graphql"
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

    let body = resp.text().await.map_err(|e| {
        tracing::error!("Failed to read Dagster response body: {e}");
        (StatusCode::BAD_GATEWAY, json!({ "error": e.to_string() }))
    })?;

    let gql: GqlResponse<T> = serde_json::from_str(&body).map_err(|e| {
        tracing::error!("Failed to parse Dagster response: {e}\nBody: {body}");
        (
            StatusCode::BAD_GATEWAY,
            json!({ "error": format!("invalid response from Dagster: {e}") }),
        )
    })?;

    if let Some(errors) = gql.errors {
        let msg = errors
            .iter()
            .map(|e| e.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        tracing::error!("Dagster GraphQL errors: {msg}");
        return Err((StatusCode::BAD_GATEWAY, json!({ "error": msg })));
    }

    gql.data.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            json!({ "error": "empty response from Dagster" }),
        )
    })
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
                .map(|a| AssetRecord {
                    id: a.id,
                    path: a.key.path,
                })
                .collect();
            Json(AssetsResponse {
                assets,
                cursor: conn.cursor,
            })
            .into_response()
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
    tags { key value }
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
      tags { key value }
      repository { location { name } }
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
    #[serde(default)]
    tags: Vec<RunTag>,
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
    #[serde(default)]
    tags: Vec<RunTag>,
    repository: Option<GqlAssetRepository>,
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
struct GqlAssetRepository {
    location: GqlAssetLocationMeta,
}

#[derive(Deserialize)]
struct GqlAssetLocationMeta {
    name: String,
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
    pub tags: Vec<RunTag>,
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
    pub tags: Vec<RunTag>,
    pub repository_location: Option<String>,
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
    MetadataEntry {
        label: e.label,
        entry_type,
        value,
    }
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
                            dependency_keys: n
                                .dependency_keys
                                .into_iter()
                                .map(|k| k.path)
                                .collect(),
                            depended_by_keys: n
                                .depended_by_keys
                                .into_iter()
                                .map(|k| k.path)
                                .collect(),
                            stale_status: n.stale_status,
                            tags: n.tags,
                            repository_location: n.repository.map(|r| r.location.name),
                            stale_causes: n
                                .stale_causes
                                .into_iter()
                                .map(|c| StaleCause {
                                    key: c.key.path,
                                    reason: c.reason,
                                    dependency: c.dependency.map(|d| d.path),
                                    category: c.category,
                                })
                                .collect(),
                            materializations: n
                                .asset_materializations
                                .into_iter()
                                .map(|m| Materialization {
                                    timestamp: m.timestamp,
                                    run_id: m.run_id,
                                    tags: m.tags,
                                    metadata: m
                                        .metadata_entries
                                        .into_iter()
                                        .map(gql_metadata_to_entry)
                                        .collect(),
                                })
                                .collect(),
                        };
                        Json(detail).into_response()
                    } else {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "error": "missing node data" })),
                        )
                            .into_response()
                    }
                }
                "AssetNotFoundError" => (
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
                    tags: n.tags,
                    last_materialization: n.asset_materializations.into_iter().next().map(|m| {
                        LastMaterialization {
                            timestamp: m.timestamp,
                            run_id: m.run_id,
                        }
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

const ASSET_REQUIRED_KEYS_QUERY: &str = r#"
query AssetRequiredKeys($assetKeys: [AssetKeyInput!]!) {
  assetNodeAdditionalRequiredKeys(assetKeys: $assetKeys) { path }
}"#;

#[derive(Deserialize)]
struct AssetRequiredKeysData {
    #[serde(rename = "assetNodeAdditionalRequiredKeys")]
    additional_required_keys: Vec<GqlAssetKey>,
}

const MATERIALIZE_ASSET_MUTATION: &str = r#"
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

const LAUNCH_PIPELINE_EXECUTION_MUTATION: &str = r#"
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
struct LaunchPipelineExecutionData {
    #[serde(rename = "launchPipelineExecution")]
    launch_pipeline_execution: GqlLaunchPipelineResult,
}

#[derive(Deserialize)]
struct GqlLaunchPipelineResult {
    #[serde(rename = "__typename")]
    typename: String,
    run: Option<GqlLaunchedPipelineRun>,
    message: Option<String>,
    errors: Option<Vec<GqlValidationError>>,
}

#[derive(Deserialize)]
struct GqlLaunchedPipelineRun {
    id: String,
    #[serde(rename = "pipelineName")]
    pipeline_name: String,
    status: String,
}

#[derive(Deserialize)]
struct GqlValidationError {
    message: String,
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
        asset_selection: r.asset_selection.unwrap_or_default().into_iter().map(|k| k.path).collect(),
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
                    next_tick: s.future_ticks.and_then(|ft| ft.results.into_iter().next()).map(|t| t.timestamp),
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
                assets: sel.assets.into_iter().map(gql_schedule_asset_to_schedule_asset).collect(),
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
        Some(s) if !s.is_empty() => s.split(',').map(str::trim).map(str::to_string).collect::<Vec<_>>(),
        _ => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "names query param required" }))).into_response(),
    };

    let results = futures::future::join_all(
        names.iter().map(|n| fetch_schedule_asset_selection(n))
    ).await;

    let mut schedules = Vec::with_capacity(names.len());
    for (name, result) in names.iter().zip(results) {
        match result {
            Ok(r) => schedules.push(r),
            Err((_, body)) => {
                let msg = body.get("error").and_then(|v| v.as_str()).unwrap_or("unknown error");
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
                    let ticks = r.ticks.unwrap_or_default().into_iter().map(|t| HistoryTick {
                        id: t.id,
                        tick_id: t.tick_id,
                        status: t.status,
                        timestamp: t.timestamp,
                        end_timestamp: t.end_timestamp,
                        cursor: t.cursor,
                        instigation_type: t.instigation_type,
                        skip_reason: t.skip_reason,
                        requested_asset_materialization_count: t.requested_asset_materialization_count,
                        run_ids: t.run_ids,
                        runs: t.runs.into_iter().map(|r| TickRun { id: r.id, status: r.status }).collect(),
                        origin_run_ids: t.origin_run_ids,
                        error: t.error.map(|e| TickError { message: e.message, stack: e.stack }),
                        log_key: t.log_key,
                        dynamic_partitions_request_results: t.dynamic_partitions_request_results.into_iter().map(|d| DynamicPartitionsResult {
                            partitions_def_name: d.partitions_def_name,
                            partition_keys: d.partition_keys,
                            skipped_partition_keys: d.skipped_partition_keys,
                            result_type: d.result_type,
                        }).collect(),
                    }).collect();
                    Json(TickHistoryResponse {
                        id: r.id.unwrap_or_default(),
                        instigation_type: r.instigation_type,
                        ticks,
                    }).into_response()
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
