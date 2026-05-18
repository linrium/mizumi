use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PermissionApprovalStep {
    pub id: Uuid,
    pub stage_order: i32,
    pub approver_team_id: Uuid,
    pub approver_team: String,
    pub approver_label: String,
    pub status: String,
    pub acted_at: Option<DateTime<Utc>>,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyTemplateApprovalStep {
    pub id: Uuid,
    pub stage_order: i32,
    pub approver_team_id: Uuid,
    pub approver_team: String,
    pub approver_label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PermissionRequestView {
    pub id: Uuid,
    pub submit_as: String,
    pub requester_id: Uuid,
    pub requester: String,
    pub requester_email: String,
    pub team_id: Option<Uuid>,
    pub team: Option<String>,
    pub resource: String,
    pub scope: String,
    pub privileges: Vec<String>,
    pub submitted_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub status: String,
    pub reviewer_id: Uuid,
    pub reviewer: String,
    pub rationale: String,
    pub risk: String,
    pub policy_template_id: Option<Uuid>,
    pub policy_template_name: Option<String>,
    pub policy_template_resource: Option<String>,
    pub policy_template_approval_mode: Option<String>,
    pub policy_template_owner_id: Option<Uuid>,
    pub policy_template_owner: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub approval_steps: Vec<PermissionApprovalStep>,
}

#[derive(Debug, Serialize)]
pub struct PermissionRequestResponse {
    pub id: Uuid,
    pub submit_as: String,
    pub requester_id: Uuid,
    pub requester: String,
    pub requester_email: String,
    pub team_id: Option<Uuid>,
    pub team: Option<String>,
    pub resource: String,
    pub scope: String,
    pub privileges: Vec<String>,
    pub submitted_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub status: String,
    pub reviewer_id: Uuid,
    pub reviewer: String,
    pub rationale: String,
    pub risk: String,
    pub policy_template_id: Option<Uuid>,
    pub policy_template_name: Option<String>,
    pub policy_template_resource: Option<String>,
    pub policy_template_approval_mode: Option<String>,
    pub policy_template_owner_id: Option<Uuid>,
    pub policy_template_owner: Option<String>,
    pub queue_decision: String,
    pub approval_steps: Vec<PermissionApprovalStep>,
    pub current_approval_step_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub code: String,
    pub expires_in_days: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequestStatusBody {
    pub status: String,
    pub approval_step_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct BulkApproveBody {
    pub ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePermissionRequestBody {
    pub requester_id: Uuid,
    pub submit_as: String,
    pub team: Option<Uuid>,
    pub resource: String,
    pub scope: String,
    pub privileges: Vec<String>,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PolicyTemplate {
    pub id: Uuid,
    pub name: String,
    pub scope: String,
    pub resource: Option<String>,
    pub team_ids: Vec<Uuid>,
    pub teams: Vec<String>,
    pub privileges: Vec<String>,
    pub approval_mode: String,
    pub risk: String,
    pub usage_30d: i32,
    pub owner_id: Uuid,
    pub owner: String,
    pub last_updated: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub approval_steps: Vec<PolicyTemplateApprovalStep>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BlastRadiusPreview {
    pub request_id: Uuid,
    pub requester: String,
    pub resource: String,
    pub scope: String,
    pub risk: String,
    pub derived_risk: String,
    pub lineage_resolved: bool,
    pub lineage_root_id: Option<Uuid>,
    pub lineage_root_display_name: Option<String>,
    pub lineage_root_type: Option<String>,
    pub total_downstream_nodes: i32,
    pub direct_downstream_nodes: i32,
    pub downstream_tables: i32,
    pub downstream_assets: i32,
    pub downstream_jobs: i32,
    pub downstream_schedules: i32,
    pub dashboards: i32,
    pub consumers: i32,
    pub sensitive_domains: Vec<String>,
    pub recommended_guardrail: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TimeBoundGrant {
    pub id: Uuid,
    pub principal: String,
    pub team: String,
    pub resource: String,
    pub privilege: String,
    pub started_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub reviewer_id: String,
    pub renewal_status: String,
    pub reason: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
