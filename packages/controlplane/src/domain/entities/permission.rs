use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct PermissionRequest {
    pub id: String,
    pub requester: String,
    pub team: String,
    pub resource: String,
    pub scope: String,
    pub privileges: Vec<String>,
    pub submitted_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub status: String,
    pub reviewer: String,
    pub rationale: String,
    pub risk: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PermissionRequestResponse {
    #[serde(flatten)]
    pub request: PermissionRequest,
    pub expires_in_days: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequestStatusBody {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct BulkApproveBody {
    pub ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct PolicyTemplate {
    pub id: String,
    pub name: String,
    pub scope: String,
    pub teams: Vec<String>,
    pub privileges: Vec<String>,
    pub approval_mode: String,
    pub risk: String,
    pub usage_30d: i32,
    pub owner: String,
    pub last_updated: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct BlastRadiusPreviewRow {
    pub request_id: String,
    pub requester: String,
    pub resource: String,
    pub scope: String,
    pub risk: String,
    pub downstream_assets: i32,
    pub dashboards: i32,
    pub consumers: i32,
    pub sensitive_domains: Vec<String>,
    pub recommended_guardrail: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TimeBoundGrant {
    pub id: String,
    pub principal: String,
    pub team: String,
    pub resource: String,
    pub privilege: String,
    pub started_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub reviewer: String,
    pub renewal_status: String,
    pub reason: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
