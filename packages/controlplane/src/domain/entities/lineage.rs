use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LineageNode {
    pub id: Uuid,
    pub node_type: String,
    pub platform: String,
    pub namespace: String,
    pub name: String,
    pub display_name: String,
    pub properties: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LineageEdge {
    pub id: Uuid,
    pub src_node_id: Uuid,
    pub dst_node_id: Uuid,
    pub edge_type: String,
    pub confidence: f64,
    pub properties: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LineageSyncRun {
    pub id: Uuid,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub nodes_count: i32,
    pub edges_count: i32,
    pub aliases_count: i32,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LineageGraphResponse {
    pub root: LineageNodeResponse,
    pub direction: String,
    pub depth: usize,
    pub nodes: Vec<LineageNodeResponse>,
    pub edges: Vec<LineageEdgeResponse>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LineageNodeResponse {
    pub id: Uuid,
    pub node_type: String,
    pub platform: String,
    pub namespace: String,
    pub name: String,
    pub display_name: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct LineageEdgeResponse {
    pub id: Uuid,
    pub source: Uuid,
    pub target: Uuid,
    pub edge_type: String,
    pub confidence: f64,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct BlastRadiusSummary {
    pub root: LineageNodeResponse,
    pub total_downstream_nodes: usize,
    pub direct_downstream_nodes: usize,
    pub downstream_datasets: usize,
    pub downstream_jobs: usize,
    pub downstream_assets: usize,
    pub downstream_schedules: usize,
    pub graph: LineageGraphResponse,
}

#[derive(Debug, Clone, Serialize)]
pub struct RebuildLineageResponse {
    pub run_id: Uuid,
    pub status: String,
    pub nodes_count: usize,
    pub edges_count: usize,
    pub aliases_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct LineageSearchResponse {
    pub results: Vec<LineageNodeResponse>,
}

#[derive(Debug, Deserialize)]
pub struct GraphQuery {
    pub root: String,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default)]
    pub limit: Option<usize>,
}
