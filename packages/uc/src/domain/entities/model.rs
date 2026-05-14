use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredModelInfo {
    pub id: Uuid,
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub full_name: String,
    pub comment: Option<String>,
    pub owner: Option<String>,
    pub storage_location: Option<String>,
    pub created_at: i64,
    pub created_by: Option<String>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateRegisteredModel {
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub comment: Option<String>,
    pub storage_location: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRegisteredModel {
    pub new_name: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListRegisteredModelsResponse {
    pub registered_models: Vec<RegisteredModelInfo>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModelVersionStatus {
    PENDING_REGISTRATION,
    FAILED_REGISTRATION,
    MODEL_VERSION_STATUS_UNKNOWN,
    READY,
}

impl ModelVersionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ModelVersionStatus::PENDING_REGISTRATION => "PENDING_REGISTRATION",
            ModelVersionStatus::FAILED_REGISTRATION => "FAILED_REGISTRATION",
            ModelVersionStatus::MODEL_VERSION_STATUS_UNKNOWN => "MODEL_VERSION_STATUS_UNKNOWN",
            ModelVersionStatus::READY => "READY",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING_REGISTRATION" => Some(ModelVersionStatus::PENDING_REGISTRATION),
            "FAILED_REGISTRATION" => Some(ModelVersionStatus::FAILED_REGISTRATION),
            "MODEL_VERSION_STATUS_UNKNOWN" => Some(ModelVersionStatus::MODEL_VERSION_STATUS_UNKNOWN),
            "READY" => Some(ModelVersionStatus::READY),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelVersionInfo {
    pub id: Uuid,
    pub model_name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub version: i64,
    pub status: ModelVersionStatus,
    pub source: Option<String>,
    pub run_id: Option<String>,
    pub comment: Option<String>,
    pub storage_location: Option<String>,
    pub created_at: i64,
    pub created_by: Option<String>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateModelVersion {
    pub model_name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub comment: Option<String>,
    pub source: Option<String>,
    pub run_id: Option<String>,
    pub storage_location: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateModelVersion {
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListModelVersionsResponse {
    pub model_versions: Vec<ModelVersionInfo>,
    pub next_page_token: Option<String>,
}
