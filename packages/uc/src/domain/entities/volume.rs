use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VolumeType {
    MANAGED,
    EXTERNAL,
}

impl VolumeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            VolumeType::MANAGED => "MANAGED",
            VolumeType::EXTERNAL => "EXTERNAL",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "MANAGED" => Some(VolumeType::MANAGED),
            "EXTERNAL" => Some(VolumeType::EXTERNAL),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeInfo {
    pub volume_id: Uuid,
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub full_name: String,
    pub volume_type: VolumeType,
    pub storage_location: Option<String>,
    pub comment: Option<String>,
    pub owner: Option<String>,
    pub created_at: i64,
    pub created_by: Option<String>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateVolume {
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub volume_type: VolumeType,
    pub storage_location: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateVolume {
    pub new_name: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListVolumesResponse {
    pub volumes: Vec<VolumeInfo>,
    pub next_page_token: Option<String>,
}
