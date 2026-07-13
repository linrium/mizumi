use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SemanticDefinition {
    pub id: Uuid,
    pub namespace: String,
    pub name: String,
    pub object_type: String,
    pub version: i32,
    pub status: String,
    pub owner_principal: String,
    pub description: String,
    pub spec: serde_json::Value,
    pub time_semantics: Option<serde_json::Value>,
    pub supersedes_definition_id: Option<Uuid>,
    pub deprecation_deadline: Option<DateTime<Utc>>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SemanticDependency {
    pub id: Uuid,
    pub source_definition_id: Uuid,
    pub target_definition_id: Uuid,
    pub dependency_type: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SemanticPhysicalDependency {
    pub id: Uuid,
    pub semantic_definition_id: Uuid,
    pub catalog: String,
    pub schema_name: String,
    pub object_name: String,
    pub object_type: String,
    pub contract_version: Option<i32>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SemanticLifecycleEvent {
    pub id: Uuid,
    pub definition_id: Uuid,
    pub previous_status: Option<String>,
    pub new_status: String,
    pub principal: String,
    pub reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SemanticDependencyRef {
    pub namespace: String,
    pub name: String,
    pub version: i32,
    #[serde(default = "default_dependency_type")]
    pub dependency_type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SemanticPhysicalDependencyInput {
    pub catalog: String,
    pub schema_name: String,
    pub object_name: String,
    #[serde(default = "default_physical_object_type")]
    pub object_type: String,
    #[serde(default)]
    pub contract_version: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSemanticDefinitionRequest {
    pub namespace: String,
    pub name: String,
    #[serde(default = "default_object_type")]
    pub object_type: String,
    pub version: i32,
    pub owner_principal: String,
    #[serde(default)]
    pub description: String,
    pub spec: serde_json::Value,
    #[serde(default)]
    pub time_semantics: Option<serde_json::Value>,
    #[serde(default)]
    pub supersedes_version: Option<i32>,
    #[serde(default)]
    pub dependencies: Vec<SemanticDependencyRef>,
    #[serde(default)]
    pub physical_dependencies: Vec<SemanticPhysicalDependencyInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TransitionSemanticStatusRequest {
    pub status: String,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SemanticDefinitionsQuery {
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub namespace: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub object_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SemanticGraphQuery {
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub depth: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SemanticCompareQuery {
    pub from: i32,
    pub to: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SemanticDefinitionSummary {
    pub namespace: String,
    pub name: String,
    pub object_type: String,
    pub owner_principal: String,
    pub description: String,
    pub active_version: Option<i32>,
    pub latest_version: i32,
    pub latest_status: String,
    pub version_count: usize,
    pub semantic_dependency_count: usize,
    pub direct_dependent_count: usize,
    pub physical_dependency_count: usize,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SemanticDefinitionDetail {
    pub definition: SemanticDefinition,
    pub dependencies: Vec<SemanticDefinition>,
    pub dependency_edges: Vec<SemanticDependency>,
    pub dependents: Vec<SemanticDefinition>,
    pub physical_dependencies: Vec<SemanticPhysicalDependency>,
    pub lifecycle_history: Vec<SemanticLifecycleEvent>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SemanticGraphResponse {
    pub root: SemanticDefinition,
    pub direction: String,
    pub depth: usize,
    pub nodes: Vec<SemanticDefinition>,
    pub edges: Vec<SemanticDependency>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SemanticCompareResponse {
    pub from: SemanticDefinitionDetail,
    pub to: SemanticDefinitionDetail,
    pub changes: serde_json::Value,
}

fn default_dependency_type() -> String {
    "semantic".to_string()
}

fn default_physical_object_type() -> String {
    "table".to_string()
}

fn default_object_type() -> String {
    "metric".to_string()
}
