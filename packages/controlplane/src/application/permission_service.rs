use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::{
        blast_radius, permission_requests, policy_templates, teams, time_bound_grants,
    },
    application::uc_service::UnityCatalogProxyService,
    domain::{
        entities::permission::{
            BlastRadiusPreviewRow, BulkApproveBody, CreatePermissionRequestBody,
            PermissionApprovalStep, PermissionRequestResponse, PermissionRequestView,
            PolicyTemplate, PolicyTemplateApprovalStep, TimeBoundGrant, UpdateRequestStatusBody,
        },
        error::AppError,
    },
};

const VALID_STATUSES: &[&str] = &["pending", "ready", "needs-info", "approved", "cancelled"];
const DEFAULT_REVIEWER_ID: &str = "10000000-0000-0000-0000-000000000011";
const SECURITY_TEAM_ID: &str = "10000000-0000-0000-0000-000000000010";

#[derive(Clone)]
struct RequestPolicyMatch {
    template_id: Uuid,
    template_name: String,
    template_resource: Option<String>,
    approval_mode: String,
    risk: String,
    owner_id: Uuid,
    approval_steps: Vec<PolicyTemplateApprovalStep>,
}

#[derive(Clone)]
pub struct PermissionService {
    db: PgPool,
    uc_service: UnityCatalogProxyService,
}

impl PermissionService {
    pub fn new(db: PgPool, uc_service: UnityCatalogProxyService) -> Self {
        Self { db, uc_service }
    }

    fn request_code(id: Uuid) -> String {
        let simple = id.simple().to_string().to_uppercase();
        format!("PR-{}", &simple[..8])
    }

    fn queue_decision(request: &PermissionRequestView) -> String {
        if request.status == "approved"
            && request.policy_template_approval_mode.as_deref() == Some("auto")
        {
            return "auto-approved".to_string();
        }

        if request
            .approval_steps
            .iter()
            .any(|step| step.approver_team.to_lowercase().contains("security"))
        {
            return "security-escalation".to_string();
        }

        if request.policy_template_id.is_some() {
            return "reviewer-gate".to_string();
        }

        "manual-review".to_string()
    }

    fn current_approval_step_id(request: &PermissionRequestView) -> Option<Uuid> {
        request
            .approval_steps
            .iter()
            .find(|step| step.is_current)
            .map(|step| step.id)
    }

    fn into_response(request: PermissionRequestView) -> PermissionRequestResponse {
        let expires_in_days = (request.expires_at - Utc::now()).num_days();
        let code = Self::request_code(request.id);
        let current_approval_step_id = Self::current_approval_step_id(&request);
        let queue_decision = Self::queue_decision(&request);

        PermissionRequestResponse {
            id: request.id,
            submit_as: request.submit_as,
            requester_id: request.requester_id,
            requester: request.requester,
            requester_email: request.requester_email,
            team_id: request.team_id,
            team: request.team,
            resource: request.resource,
            scope: request.scope,
            privileges: request.privileges,
            submitted_at: request.submitted_at,
            expires_at: request.expires_at,
            status: request.status,
            reviewer_id: request.reviewer_id,
            reviewer: request.reviewer,
            rationale: request.rationale,
            risk: request.risk,
            policy_template_id: request.policy_template_id,
            policy_template_name: request.policy_template_name,
            policy_template_resource: request.policy_template_resource,
            policy_template_approval_mode: request.policy_template_approval_mode,
            policy_template_owner_id: request.policy_template_owner_id,
            policy_template_owner: request.policy_template_owner,
            queue_decision,
            approval_steps: request.approval_steps,
            current_approval_step_id,
            created_at: request.created_at,
            updated_at: request.updated_at,
            code,
            expires_in_days,
        }
    }

    async fn grant_request(&self, request: &PermissionRequestView) -> Result<(), AppError> {
        self.uc_service
            .grant_permissions(
                &request.scope,
                &request.resource,
                &request.requester_email,
                &request.privileges,
            )
            .await
            .map_err(AppError::QueryFailed)
    }

    fn best_template_match(
        request: &PermissionRequestView,
        templates: &[PolicyTemplate],
    ) -> Option<RequestPolicyMatch> {
        let mut matches = templates
            .iter()
            .filter(|template| {
                template.scope == request.scope
                    && (template.resource.is_none()
                        || template.resource.as_deref() == Some(request.resource.as_str()))
                    && request.team_id.as_ref().is_some_and(|request_team_id| {
                        template
                            .team_ids
                            .iter()
                            .any(|team_id| team_id == request_team_id)
                    })
                    && request.privileges.iter().all(|privilege| {
                        template
                            .privileges
                            .iter()
                            .any(|candidate| candidate == privilege)
                    })
            })
            .cloned()
            .collect::<Vec<_>>();

        matches.sort_by(|left, right| {
            right
                .resource
                .is_some()
                .cmp(&left.resource.is_some())
                .then_with(|| left.team_ids.len().cmp(&right.team_ids.len()))
                .then_with(|| left.privileges.len().cmp(&right.privileges.len()))
                .then_with(|| right.last_updated.cmp(&left.last_updated))
                .then_with(|| left.id.cmp(&right.id))
        });

        matches
            .into_iter()
            .next()
            .map(|template| RequestPolicyMatch {
                template_id: template.id,
                template_name: template.name,
                template_resource: template.resource,
                approval_mode: template.approval_mode,
                risk: template.risk,
                owner_id: template.owner_id,
                approval_steps: template.approval_steps,
            })
    }

    fn default_approval_steps_for_mode(
        policy_match: &RequestPolicyMatch,
    ) -> Vec<(i32, Uuid, String)> {
        match policy_match.approval_mode.as_str() {
            "auto" => Vec::new(),
            "review" => vec![(
                1,
                policy_match.owner_id,
                "Template owner review".to_string(),
            )],
            "escalate" => {
                let security_id = Uuid::parse_str(SECURITY_TEAM_ID)
                    .expect("SECURITY_TEAM_ID must be a valid UUID");
                let mut steps = vec![(
                    1,
                    policy_match.owner_id,
                    "Template owner review".to_string(),
                )];
                if policy_match.owner_id != security_id {
                    steps.push((2, security_id, "Security escalation".to_string()));
                }
                steps
            }
            _ => vec![(
                1,
                policy_match.owner_id,
                "Template owner review".to_string(),
            )],
        }
    }

    fn manual_review_chain() -> Vec<(i32, Uuid, String)> {
        vec![(
            1,
            Uuid::parse_str(DEFAULT_REVIEWER_ID).expect("DEFAULT_REVIEWER_ID must be a valid UUID"),
            "Manual review".to_string(),
        )]
    }

    fn approval_chain_from_policy_match(
        policy_match: Option<&RequestPolicyMatch>,
    ) -> Vec<(i32, Uuid, String)> {
        match policy_match {
            Some(policy_match) if !policy_match.approval_steps.is_empty() => policy_match
                .approval_steps
                .iter()
                .map(|step| {
                    (
                        step.stage_order,
                        step.approver_team_id,
                        step.approver_label.clone(),
                    )
                })
                .collect(),
            Some(policy_match) => Self::default_approval_steps_for_mode(policy_match),
            None => Self::manual_review_chain(),
        }
    }

    fn derive_request_state(steps: &[PermissionApprovalStep]) -> (String, Uuid) {
        let default_reviewer_id =
            Uuid::parse_str(DEFAULT_REVIEWER_ID).expect("DEFAULT_REVIEWER_ID must be a valid UUID");

        if steps.is_empty() {
            return ("approved".to_string(), default_reviewer_id);
        }

        if let Some(step) = steps.iter().find(|step| step.status == "needs-info") {
            return ("needs-info".to_string(), step.approver_team_id);
        }

        let mut current = steps
            .iter()
            .filter(|step| step.is_current)
            .collect::<Vec<_>>();
        current.sort_by_key(|step| (step.stage_order, step.approver_team.as_str()));
        if let Some(step) = current.first() {
            return ("ready".to_string(), step.approver_team_id);
        }

        if steps.iter().all(|step| step.status == "approved") {
            let reviewer_id = steps
                .last()
                .map(|step| step.approver_team_id)
                .unwrap_or(default_reviewer_id);
            return ("approved".to_string(), reviewer_id);
        }

        if steps.iter().all(|step| step.status == "cancelled") {
            let reviewer_id = steps
                .last()
                .map(|step| step.approver_team_id)
                .unwrap_or(default_reviewer_id);
            return ("cancelled".to_string(), reviewer_id);
        }

        let reviewer_id = steps
            .iter()
            .find(|step| step.status == "waiting")
            .map(|step| step.approver_team_id)
            .unwrap_or(default_reviewer_id);

        ("pending".to_string(), reviewer_id)
    }

    async fn sync_request_state(
        &self,
        request_id: Uuid,
    ) -> Result<PermissionRequestView, AppError> {
        let steps = permission_requests::list_approval_steps(&self.db, &[request_id])
            .await?
            .remove(&request_id)
            .unwrap_or_default();
        let (status, reviewer_id) = Self::derive_request_state(&steps);
        permission_requests::update_status_and_reviewer(&self.db, request_id, &status, reviewer_id)
            .await?
            .ok_or(AppError::NotFound)
    }

    fn resolve_target_step_id(
        steps: &[PermissionApprovalStep],
        requested_step_id: Option<Uuid>,
    ) -> Result<Uuid, AppError> {
        if let Some(approval_step_id) = requested_step_id {
            return Ok(approval_step_id);
        }

        let current_steps = steps
            .iter()
            .filter(|step| step.is_current)
            .collect::<Vec<_>>();
        if current_steps.len() == 1 {
            return Ok(current_steps[0].id);
        }

        Err(AppError::QueryFailed(
            "approval_step_id is required when multiple teams can act on this request".into(),
        ))
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
                        r.id.to_string().contains(&q)
                            || r.requester.to_lowercase().contains(&q)
                            || r.requester_email.to_lowercase().contains(&q)
                            || r.team
                                .as_ref()
                                .is_some_and(|team| team.to_lowercase().contains(&q))
                            || r.resource.to_lowercase().contains(&q)
                            || r.status.to_lowercase().contains(&q)
                            || r.reviewer.to_lowercase().contains(&q)
                            || r.approval_steps.iter().any(|step| {
                                step.approver_team.to_lowercase().contains(&q)
                                    || step.approver_label.to_lowercase().contains(&q)
                            })
                            || r.policy_template_name
                                .as_ref()
                                .is_some_and(|name| name.to_lowercase().contains(&q))
                            || r.policy_template_owner
                                .as_ref()
                                .is_some_and(|owner| owner.to_lowercase().contains(&q))
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
        if body.privileges.is_empty() {
            return Err(AppError::QueryFailed(
                "at least one privilege is required".into(),
            ));
        }

        let team = match body.submit_as.as_str() {
            "personal" => None,
            "team" => {
                let team = body.team.ok_or_else(|| {
                    AppError::QueryFailed("selected team is required for team requests".into())
                })?;

                if teams::get(&self.db, team).await?.is_none() {
                    return Err(AppError::QueryFailed("selected team does not exist".into()));
                }

                if !teams::is_member(&self.db, team, body.requester_id).await? {
                    return Err(AppError::QueryFailed(
                        "requester is not a member of the selected team".into(),
                    ));
                }

                Some(team)
            }
            _ => {
                return Err(AppError::QueryFailed(
                    "submit_as must be either 'personal' or 'team'".into(),
                ));
            }
        };

        let request = permission_requests::create(
            &self.db,
            body.requester_id,
            team,
            &body.resource,
            &body.scope,
            &body.privileges,
            &body.rationale,
        )
        .await?;

        let templates = policy_templates::list(&self.db).await?;
        let matched_template = Self::best_template_match(&request, &templates);
        let approval_chain = Self::approval_chain_from_policy_match(matched_template.as_ref());

        let mut request = if approval_chain.is_empty() {
            let reviewer_id = matched_template
                .as_ref()
                .map(|policy_match| policy_match.owner_id)
                .unwrap_or_else(|| {
                    Uuid::parse_str(DEFAULT_REVIEWER_ID)
                        .expect("DEFAULT_REVIEWER_ID must be a valid UUID")
                });
            permission_requests::update_policy_metadata(
                &self.db,
                request.id,
                matched_template
                    .as_ref()
                    .map(|policy_match| policy_match.template_id),
                reviewer_id,
                matched_template
                    .as_ref()
                    .map(|policy_match| policy_match.risk.as_str())
                    .unwrap_or("low"),
                "approved",
            )
            .await?
            .ok_or(AppError::NotFound)?
        } else {
            let new_steps = approval_chain
                .into_iter()
                .map(|(stage_order, approver_team_id, approver_label)| {
                    permission_requests::NewApprovalStep {
                        stage_order,
                        approver_team_id,
                        approver_label,
                    }
                })
                .collect::<Vec<_>>();
            let inserted_steps =
                permission_requests::replace_approval_steps(&self.db, request.id, &new_steps)
                    .await?;
            let (status, reviewer_id) = Self::derive_request_state(&inserted_steps);
            permission_requests::update_policy_metadata(
                &self.db,
                request.id,
                matched_template
                    .as_ref()
                    .map(|policy_match| policy_match.template_id),
                reviewer_id,
                matched_template
                    .as_ref()
                    .map(|policy_match| policy_match.risk.as_str())
                    .unwrap_or("low"),
                &status,
            )
            .await?
            .ok_or(AppError::NotFound)?
        };

        if let Some(policy_match) = matched_template {
            request.policy_template_id = Some(policy_match.template_id);
            request.policy_template_name = Some(policy_match.template_name);
            request.policy_template_resource = policy_match.template_resource;
            request.policy_template_approval_mode = Some(policy_match.approval_mode);
            request.policy_template_owner_id = Some(policy_match.owner_id);
        }

        if request.status == "approved" {
            self.grant_request(&request).await?;
        }

        Ok(Self::into_response(request))
    }

    pub async fn get_request(&self, id: Uuid) -> Result<PermissionRequestResponse, AppError> {
        let request = permission_requests::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;
        Ok(Self::into_response(request))
    }

    pub async fn update_request_status(
        &self,
        id: Uuid,
        body: UpdateRequestStatusBody,
    ) -> Result<PermissionRequestResponse, AppError> {
        if !VALID_STATUSES.contains(&body.status.as_str()) {
            return Err(AppError::QueryFailed(format!(
                "invalid status '{}', must be one of: {}",
                body.status,
                VALID_STATUSES.join(", ")
            )));
        }

        let existing = permission_requests::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;

        let updated = match body.status.as_str() {
            "cancelled" => {
                permission_requests::cancel_open_steps(&self.db, id).await?;
                self.sync_request_state(id).await?
            }
            "approved" => {
                if existing.approval_steps.is_empty() {
                    let reviewer_id = existing.reviewer_id;
                    let request = permission_requests::update_status_and_reviewer(
                        &self.db,
                        id,
                        "approved",
                        reviewer_id,
                    )
                    .await?
                    .ok_or(AppError::NotFound)?;
                    self.grant_request(&request).await?;
                    request
                } else {
                    let step_id = Self::resolve_target_step_id(
                        &existing.approval_steps,
                        body.approval_step_id,
                    )?;
                    if !permission_requests::mark_approval_step(&self.db, id, step_id, "approved")
                        .await?
                    {
                        return Err(AppError::QueryFailed(
                            "approval step is not currently actionable".into(),
                        ));
                    }
                    permission_requests::activate_next_stage_if_ready(&self.db, id).await?;
                    let request = self.sync_request_state(id).await?;
                    if request.status == "approved" {
                        self.grant_request(&request).await?;
                    }
                    request
                }
            }
            "needs-info" => {
                let step_id =
                    Self::resolve_target_step_id(&existing.approval_steps, body.approval_step_id)?;
                if !permission_requests::mark_approval_step(&self.db, id, step_id, "needs-info")
                    .await?
                {
                    return Err(AppError::QueryFailed(
                        "approval step is not currently actionable".into(),
                    ));
                }
                self.sync_request_state(id).await?
            }
            other => permission_requests::update_status_and_reviewer(
                &self.db,
                id,
                other,
                existing.reviewer_id,
            )
            .await?
            .ok_or(AppError::NotFound)?,
        };

        Ok(Self::into_response(updated))
    }

    pub async fn bulk_approve(
        &self,
        body: BulkApproveBody,
    ) -> Result<Vec<PermissionRequestResponse>, AppError> {
        if body.ids.is_empty() {
            return Ok(Vec::new());
        }

        let requests = permission_requests::list_by_ids(&self.db, &body.ids).await?;
        for request in &requests {
            permission_requests::approve_all_steps(&self.db, request.id).await?;
            if request.status != "approved" {
                self.grant_request(request).await?;
            }
        }

        let reviewer_id =
            Uuid::parse_str(DEFAULT_REVIEWER_ID).expect("DEFAULT_REVIEWER_ID must be a valid UUID");
        let requests =
            permission_requests::bulk_update_status(&self.db, &body.ids, "approved", reviewer_id)
                .await?;
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
