use chrono::Utc;
use sqlx::PgPool;

use crate::{
    adapters::outbound::postgres::{blast_radius, permission_requests, policy_templates, time_bound_grants},
    domain::{
        entities::permission::{
            BlastRadiusPreviewRow, BulkApproveBody, CreatePermissionRequestBody,
            PermissionRequest, PermissionRequestResponse, PolicyTemplate, TimeBoundGrant,
            UpdateRequestStatusBody,
        },
        error::AppError,
    },
};

const VALID_STATUSES: &[&str] = &["pending", "ready", "needs-info", "approved", "cancelled"];

#[derive(Clone)]
pub struct PermissionService {
    db: PgPool,
}

impl PermissionService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    fn into_response(request: PermissionRequest) -> PermissionRequestResponse {
        let expires_in_days = (request.expires_at - Utc::now()).num_days();
        PermissionRequestResponse { request, expires_in_days }
    }

    pub async fn list_requests(
        &self,
        resource: Option<&str>,
        status: Option<&str>,
        search: Option<&str>,
    ) -> Result<Vec<PermissionRequestResponse>, AppError> {
        let requests = permission_requests::list(&self.db, resource).await?;

        let filtered = requests
            .into_iter()
            .filter(|r| {
                let status_ok = match status {
                    Some(s) if s != "all" => r.status == s,
                    _ => true,
                };
                let search_ok = match search {
                    Some(q) if !q.is_empty() => {
                        let q = q.to_lowercase();
                        r.id.to_lowercase().contains(&q)
                            || r.requester.to_lowercase().contains(&q)
                            || r.team.to_lowercase().contains(&q)
                            || r.resource.to_lowercase().contains(&q)
                            || r.reviewer.to_lowercase().contains(&q)
                            || r.rationale.to_lowercase().contains(&q)
                            || r.privileges.iter().any(|p| p.to_lowercase().contains(&q))
                    }
                    _ => true,
                };
                status_ok && search_ok
            })
            .map(Self::into_response)
            .collect();

        Ok(filtered)
    }

    pub async fn create_request(
        &self,
        body: CreatePermissionRequestBody,
    ) -> Result<PermissionRequestResponse, AppError> {
        if body.requester.trim().is_empty() {
            return Err(AppError::QueryFailed("requester is required".into()));
        }
        if body.privileges.is_empty() {
            return Err(AppError::QueryFailed("at least one privilege is required".into()));
        }
        let request = permission_requests::create(
            &self.db,
            body.requester.trim(),
            body.team.as_deref().unwrap_or(""),
            &body.resource,
            &body.scope,
            &body.privileges,
            &body.rationale,
        )
        .await?;
        Ok(Self::into_response(request))
    }

    pub async fn get_request(&self, id: &str) -> Result<PermissionRequestResponse, AppError> {
        let request = permission_requests::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;
        Ok(Self::into_response(request))
    }

    pub async fn update_request_status(
        &self,
        id: &str,
        body: UpdateRequestStatusBody,
    ) -> Result<PermissionRequestResponse, AppError> {
        if !VALID_STATUSES.contains(&body.status.as_str()) {
            return Err(AppError::QueryFailed(format!(
                "invalid status '{}', must be one of: {}",
                body.status,
                VALID_STATUSES.join(", ")
            )));
        }
        let request = permission_requests::update_status(&self.db, id, &body.status)
            .await?
            .ok_or(AppError::NotFound)?;
        Ok(Self::into_response(request))
    }

    pub async fn bulk_approve(
        &self,
        body: BulkApproveBody,
    ) -> Result<Vec<PermissionRequestResponse>, AppError> {
        let requests =
            permission_requests::bulk_update_status(&self.db, &body.ids, "approved").await?;
        Ok(requests.into_iter().map(Self::into_response).collect())
    }

    pub async fn list_policy_templates(&self) -> Result<Vec<PolicyTemplate>, AppError> {
        Ok(policy_templates::list(&self.db).await?)
    }

    pub async fn list_blast_radius(&self) -> Result<Vec<BlastRadiusPreviewRow>, AppError> {
        Ok(blast_radius::list(&self.db).await?)
    }

    pub async fn list_time_bound_grants(&self) -> Result<Vec<TimeBoundGrant>, AppError> {
        Ok(time_bound_grants::list(&self.db).await?)
    }
}
