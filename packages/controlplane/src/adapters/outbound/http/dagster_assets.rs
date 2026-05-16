use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::dagster_client::gql_post;

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
