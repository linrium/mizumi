use chrono::Utc;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet, VecDeque};
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::{
        blast_radius, lineage, permission_requests, policy_templates, teams, time_bound_grants,
    },
    application::{
        llm_service::LlmService,
        uc_service::UnityCatalogProxyService,
    },
    domain::{
        entities::lineage::{LineageEdge, LineageNode},
        entities::permission::{
            AffectedComponent, BlastRadiusPreview, BulkApproveBody, CreatePermissionRequestBody,
            PermissionApprovalStep, PermissionRequestResponse, PermissionRequestView,
            PolicyTemplate, PolicyTemplateApprovalStep, TimeBoundGrant, UpdateRequestStatusBody,
        },
        error::AppError,
    },
};

const VALID_STATUSES: &[&str] = &["pending", "ready", "needs-info", "approved", "cancelled"];
const REVIEWER_VIETJETAIR: &str = "10000000-0000-0000-0000-000000000002"; // VietJetair Data Platform
const REVIEWER_DEFAULT: &str = "10000000-0000-0000-0000-000000000004"; // HDBank Data Steward
const SECURITY_TEAM_ID: &str = "10000000-0000-0000-0000-000000000005";

fn default_reviewer_id(resource: &str) -> Uuid {
    let id = if resource.contains("vietjetair") {
        REVIEWER_VIETJETAIR
    } else {
        REVIEWER_DEFAULT
    };
    Uuid::parse_str(id).expect("reviewer UUID is valid")
}

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
    llm_service: Option<LlmService>,
}

impl PermissionService {
    pub fn new(
        db: PgPool,
        uc_service: UnityCatalogProxyService,
        llm_service: Option<LlmService>,
    ) -> Self {
        Self {
            db,
            uc_service,
            llm_service,
        }
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

    fn scope_root_aliases(request: &PermissionRequestView) -> Vec<String> {
        match request.scope.as_str() {
            "table" => vec![request.resource.clone()],
            "schema" => vec![request.resource.clone()],
            "catalog" => vec![request.resource.clone()],
            _ => vec![request.resource.clone()],
        }
    }

    fn business_tokens(value: &str) -> Vec<String> {
        const STOPWORDS: &[&str] = &[
            "hdbank",
            "vietjetair",
            "partnership",
            "sandbox",
            "prod",
            "bronze",
            "silver",
            "gold",
            "unitycatalog",
            "raw",
            "table",
            "schema",
            "catalog",
            "dagster",
            "spark",
            "streaming",
            "job",
            "events",
            "event",
            "build",
            "analytics",
            "data",
            "asset",
            "v1",
            "v2",
        ];

        value
            .split(|c: char| !c.is_ascii_alphanumeric())
            .filter_map(|token| {
                let token = token.trim().to_lowercase();
                if token.len() < 4
                    || STOPWORDS.contains(&token.as_str())
                    || token.chars().all(|c| c.is_ascii_digit())
                {
                    return None;
                }
                Some(token)
            })
            .collect()
    }

    fn collect_sensitive_domains(nodes: &[&LineageNode]) -> Vec<String> {
        let mut counts = HashMap::<String, usize>::new();

        for node in nodes {
            for value in [
                node.display_name.as_str(),
                node.name.as_str(),
                node.properties
                    .get("schema_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default(),
                node.properties
                    .get("catalog_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default(),
            ] {
                for token in Self::business_tokens(value) {
                    *counts.entry(token).or_insert(0) += 1;
                }
            }
        }

        let mut ranked = counts.into_iter().collect::<Vec<_>>();
        ranked.sort_by(|(left_token, left_count), (right_token, right_count)| {
            right_count
                .cmp(left_count)
                .then_with(|| left_token.cmp(right_token))
        });
        ranked.into_iter().take(5).map(|(token, _)| token).collect()
    }

    fn derived_blast_radius_risk(
        request: &PermissionRequestView,
        preview: &BlastRadiusPreview,
    ) -> String {
        let mutating = request.privileges.iter().any(|privilege| {
            matches!(
                privilege.as_str(),
                "MODIFY" | "UPDATE" | "DELETE" | "INSERT" | "MERGE" | "WRITE" | "ALTER"
            )
        });

        let resource = request.resource.to_lowercase();
        let bronze_or_raw = resource.contains("bronze") || resource.contains("raw");
        let has_large_downstream = preview.total_downstream_nodes >= 10
            || preview.downstream_tables >= 3
            || preview.downstream_assets > 0
            || preview.downstream_jobs > 0
            || preview.downstream_schedules > 0;

        if mutating {
            if bronze_or_raw
                || preview
                    .lineage_root_type
                    .as_deref()
                    .is_some_and(|ty| ty == "table" || ty == "schema")
                || has_large_downstream
            {
                return "high".to_string();
            }

            return "medium".to_string();
        }

        if preview.downstream_schedules > 0 || preview.total_downstream_nodes >= 15 {
            return "medium".to_string();
        }

        if has_large_downstream {
            return "medium".to_string();
        }

        "low".to_string()
    }

    fn build_blast_radius_preview(
        request: &PermissionRequestView,
        nodes_by_id: &HashMap<Uuid, LineageNode>,
        downstream_edges_by_src: &HashMap<Uuid, Vec<LineageEdge>>,
        aliases: &HashMap<String, Uuid>,
        llm_data: Option<&blast_radius::BlastRadiusLlmData>,
    ) -> BlastRadiusPreview {
        let root = Self::scope_root_aliases(request)
            .into_iter()
            .find_map(|alias| {
                aliases
                    .get(&alias)
                    .and_then(|id| nodes_by_id.get(id))
                    .cloned()
            });

        let Some(root) = root else {
            let mut preview = BlastRadiusPreview {
                request_id: request.id,
                code: Self::request_code(request.id),
                requester: request.requester.clone(),
                resource: request.resource.clone(),
                scope: request.scope.clone(),
                risk: request.risk.clone(),
                lineage_resolved: false,
                lineage_root_id: None,
                lineage_root_display_name: None,
                lineage_root_type: None,
                total_downstream_nodes: 0,
                direct_downstream_nodes: 0,
                downstream_tables: 0,
                downstream_assets: 0,
                downstream_jobs: 0,
                downstream_schedules: 0,
                dashboards: 0,
                consumers: 0,
                sensitive_domains: Vec::new(),
                derived_risk: String::new(),
                recommended_guardrail: llm_data
                    .map(|d| d.recommended_guardrail.clone())
                    .unwrap_or_default(),
                llm_risk: llm_data
                    .map(|d| d.llm_risk.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                llm_recommendation: llm_data
                    .map(|d| d.llm_recommendation.clone())
                    .unwrap_or_default(),
                llm_explanation: llm_data
                    .map(|d| d.llm_explanation.clone())
                    .unwrap_or_default(),
                affected_nodes: Vec::new(),
            };
            preview.derived_risk = Self::derived_blast_radius_risk(request, &preview);
            return preview;
        };

        let mut visited = HashSet::from([root.id]);
        let mut queue = VecDeque::from([root.id]);

        while let Some(current) = queue.pop_front() {
            if let Some(edges) = downstream_edges_by_src.get(&current) {
                for edge in edges {
                    if visited.insert(edge.dst_node_id) {
                        queue.push_back(edge.dst_node_id);
                    }
                }
            }
        }

        let direct_downstream_nodes = downstream_edges_by_src
            .get(&root.id)
            .map(|edges| {
                edges
                    .iter()
                    .map(|edge| edge.dst_node_id)
                    .collect::<HashSet<_>>()
                    .len() as i32
            })
            .unwrap_or(0);

        let downstream_nodes = visited
            .into_iter()
            .filter(|node_id| *node_id != root.id)
            .filter_map(|node_id| nodes_by_id.get(&node_id))
            .collect::<Vec<_>>();

        let mut downstream_tables = 0i32;
        let mut downstream_assets = 0i32;
        let mut downstream_jobs = 0i32;
        let mut downstream_schedules = 0i32;
        let mut dashboards = 0i32;
        let mut consumers = 0i32;

        for node in &downstream_nodes {
            match node.node_type.as_str() {
                "table" | "topic" => downstream_tables += 1,
                "dagster_asset" => downstream_assets += 1,
                "spark_job" | "streaming_job" | "daft_job" | "dagster_job" => downstream_jobs += 1,
                "schedule" => downstream_schedules += 1,
                "dashboard" => dashboards += 1,
                "consumer" => consumers += 1,
                _ => {}
            }
        }

        let mut domain_nodes = Vec::with_capacity(downstream_nodes.len() + 1);
        domain_nodes.push(&root);
        domain_nodes.extend(downstream_nodes.iter().copied());

        let mut preview = BlastRadiusPreview {
            request_id: request.id,
            code: Self::request_code(request.id),
            requester: request.requester.clone(),
            resource: request.resource.clone(),
            scope: request.scope.clone(),
            risk: request.risk.clone(),
            derived_risk: String::new(),
            lineage_resolved: true,
            lineage_root_id: Some(root.id),
            lineage_root_display_name: Some(root.display_name.clone()),
            lineage_root_type: Some(root.node_type.clone()),
            total_downstream_nodes: downstream_nodes.len() as i32,
            direct_downstream_nodes,
            downstream_tables,
            downstream_assets,
            downstream_jobs,
            downstream_schedules,
            dashboards,
            consumers,
            sensitive_domains: Self::collect_sensitive_domains(&domain_nodes),
            recommended_guardrail: llm_data
                .map(|d| d.recommended_guardrail.clone())
                .unwrap_or_default(),
            llm_risk: llm_data
                .map(|d| d.llm_risk.clone())
                .unwrap_or_else(|| "unknown".to_string()),
            llm_recommendation: llm_data
                .map(|d| d.llm_recommendation.clone())
                .unwrap_or_default(),
            llm_explanation: llm_data
                .map(|d| d.llm_explanation.clone())
                .unwrap_or_default(),
            affected_nodes: downstream_nodes
                .iter()
                .map(|n| AffectedComponent {
                    display_name: n.display_name.clone(),
                    node_type: n.node_type.clone(),
                })
                .collect(),
        };
        preview.derived_risk = Self::derived_blast_radius_risk(request, &preview);
        preview
    }

    async fn grant_request(&self, request: &PermissionRequestView) -> Result<(), AppError> {
        let principals: Vec<String> = if request.submit_as == "team" {
            if let Some(team_id) = request.team_id {
                teams::list_members(&self.db, team_id)
                    .await
                    .map_err(AppError::Sqlx)?
                    .into_iter()
                    .map(|m| m.email)
                    .collect()
            } else {
                vec![request.requester_email.clone()]
            }
        } else {
            vec![request.requester_email.clone()]
        };

        for principal in &principals {
            self.uc_service
                .grant_permissions(
                    &request.scope,
                    &request.resource,
                    principal,
                    &request.privileges,
                )
                .await
                .map_err(AppError::QueryFailed)?;
        }

        Ok(())
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

    fn manual_review_chain(resource: &str) -> Vec<(i32, Uuid, String)> {
        vec![(
            1,
            default_reviewer_id(resource),
            "Manual review".to_string(),
        )]
    }

    fn approval_chain_from_policy_match(
        policy_match: Option<&RequestPolicyMatch>,
        resource: &str,
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
            None => Self::manual_review_chain(resource),
        }
    }

    fn derive_request_state(steps: &[PermissionApprovalStep], resource: &str) -> (String, Uuid) {
        if steps.is_empty() {
            return ("approved".to_string(), default_reviewer_id(resource));
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
                .unwrap_or_else(|| default_reviewer_id(resource));
            return ("approved".to_string(), reviewer_id);
        }

        if steps.iter().all(|step| step.status == "cancelled") {
            let reviewer_id = steps
                .last()
                .map(|step| step.approver_team_id)
                .unwrap_or_else(|| default_reviewer_id(resource));
            return ("cancelled".to_string(), reviewer_id);
        }

        let reviewer_id = steps
            .iter()
            .find(|step| step.status == "waiting")
            .map(|step| step.approver_team_id)
            .unwrap_or_else(|| default_reviewer_id(resource));

        ("pending".to_string(), reviewer_id)
    }

    async fn sync_request_state(
        &self,
        request_id: Uuid,
        resource: &str,
    ) -> Result<PermissionRequestView, AppError> {
        let steps = permission_requests::list_approval_steps(&self.db, &[request_id])
            .await?
            .remove(&request_id)
            .unwrap_or_default();
        let (status, reviewer_id) = Self::derive_request_state(&steps, resource);
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

    /// Spawn a background Tokio task that calls the LLM to analyze the request's blast radius
    /// and updates `blast_radius_previews` with the result.
    fn spawn_llm_analysis(&self, request: PermissionRequestView) {
        let Some(llm) = self.llm_service.clone() else {
            return;
        };
        let db = self.db.clone();
        let request_id = request.id;

        tokio::spawn(async move {
            tracing::info!(request_id = %request_id, "starting LLM blast-radius analysis");

            // Build blast-radius preview from current lineage data.
            let preview = async {
                let nodes = lineage::list_nodes(&db).await?;
                let edges = lineage::list_edges(&db).await?;
                let aliases = lineage::list_aliases(&db).await?;
                let nodes_by_id = nodes.into_iter().map(|n| (n.id, n)).collect::<HashMap<_, _>>();
                let mut downstream_edges_by_src = HashMap::<Uuid, Vec<LineageEdge>>::new();
                for edge in edges {
                    downstream_edges_by_src.entry(edge.src_node_id).or_default().push(edge);
                }
                let aliases_map = aliases.into_iter().collect::<HashMap<_, _>>();
                Ok::<_, sqlx::Error>(Self::build_blast_radius_preview(
                    &request,
                    &nodes_by_id,
                    &downstream_edges_by_src,
                    &aliases_map,
                    None,
                ))
            }
            .await;

            let preview = match preview {
                Ok(p) => p,
                Err(e) => {
                    tracing::warn!(request_id = %request_id, error = %e, "LLM task: lineage query failed");
                    let _ = blast_radius::update_llm_result(&db, request_id, "", "failed", "").await;
                    return;
                }
            };

            match llm
                .analyze_blast_radius(
                    &request.resource,
                    &request.scope,
                    &request.privileges,
                    &request.rationale,
                    &preview,
                )
                .await
            {
                Ok(analysis) => {
                    tracing::info!(
                        request_id = %request_id,
                        risk = %analysis.risk_level,
                        "LLM blast-radius analysis complete"
                    );
                    let _ = blast_radius::update_llm_result(
                        &db,
                        request_id,
                        &analysis.recommendation,
                        &analysis.risk_level,
                        &analysis.explanation,
                    )
                    .await;
                }
                Err(e) => {
                    tracing::warn!(request_id = %request_id, error = %e, "LLM blast-radius analysis failed");
                    let _ = blast_radius::update_llm_result(&db, request_id, "", "failed", "").await;
                }
            }
        });
    }

    pub async fn list_requests(
        &self,
        resource: Option<&str>,
        status: Option<&str>,
        search: Option<&str>,
        viewer_id: Option<Uuid>,
    ) -> Result<Vec<PermissionRequestResponse>, AppError> {
        let requests = permission_requests::list(&self.db, resource, viewer_id).await?;

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
        let approval_chain =
            Self::approval_chain_from_policy_match(matched_template.as_ref(), &request.resource);

        let mut request = if approval_chain.is_empty() {
            let reviewer_id = matched_template
                .as_ref()
                .map(|policy_match| policy_match.owner_id)
                .unwrap_or_else(|| default_reviewer_id(&request.resource));
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
            let (status, reviewer_id) =
                Self::derive_request_state(&inserted_steps, &request.resource);
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

        // Insert the blast-radius preview row with llm_risk = 'processing' and
        // spawn a background task that calls the LLM to fill in the guardrail and risk.
        let request_id = request.id;
        if let Err(e) = blast_radius::upsert_processing(&self.db, request_id).await {
            tracing::warn!(request_id = %request_id, error = %e, "failed to upsert blast_radius_previews row");
        } else {
            self.spawn_llm_analysis(request.clone());
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
                self.sync_request_state(id, &existing.resource).await?
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
                    let request = self.sync_request_state(id, &existing.resource).await?;
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
                self.sync_request_state(id, &existing.resource).await?
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

        let requests =
            permission_requests::bulk_update_status(&self.db, &body.ids, "approved").await?;
        Ok(requests.into_iter().map(Self::into_response).collect())
    }

    pub async fn list_policy_templates(&self) -> Result<Vec<PolicyTemplate>, AppError> {
        Ok(policy_templates::list(&self.db).await?)
    }

    pub async fn list_blast_radius(&self) -> Result<Vec<BlastRadiusPreview>, AppError> {
        let requests = permission_requests::list(&self.db, None, None).await?;
        let nodes = lineage::list_nodes(&self.db).await?;
        let edges = lineage::list_edges(&self.db).await?;
        let aliases = lineage::list_aliases(&self.db).await?;
        let llm_map = blast_radius::list_llm_data(&self.db).await?;

        let nodes_by_id = nodes
            .into_iter()
            .map(|node| (node.id, node))
            .collect::<HashMap<_, _>>();
        let mut downstream_edges_by_src = HashMap::<Uuid, Vec<LineageEdge>>::new();
        for edge in edges {
            downstream_edges_by_src
                .entry(edge.src_node_id)
                .or_default()
                .push(edge);
        }
        let aliases = aliases.into_iter().collect::<HashMap<_, _>>();

        Ok(requests
            .iter()
            .map(|request| {
                let llm_data = llm_map.get(&request.id);
                Self::build_blast_radius_preview(
                    request,
                    &nodes_by_id,
                    &downstream_edges_by_src,
                    &aliases,
                    llm_data,
                )
            })
            .collect())
    }

    pub async fn get_blast_radius(&self, request_id: Uuid) -> Result<BlastRadiusPreview, AppError> {
        let request = permission_requests::get(&self.db, request_id)
            .await?
            .ok_or(AppError::NotFound)?;
        let nodes = lineage::list_nodes(&self.db).await?;
        let edges = lineage::list_edges(&self.db).await?;
        let aliases = lineage::list_aliases(&self.db).await?;
        let llm_data = blast_radius::get_llm_data(&self.db, request_id).await?;

        let nodes_by_id = nodes
            .into_iter()
            .map(|node| (node.id, node))
            .collect::<HashMap<_, _>>();
        let mut downstream_edges_by_src = HashMap::<Uuid, Vec<LineageEdge>>::new();
        for edge in edges {
            downstream_edges_by_src
                .entry(edge.src_node_id)
                .or_default()
                .push(edge);
        }
        let aliases = aliases.into_iter().collect::<HashMap<_, _>>();

        Ok(Self::build_blast_radius_preview(
            &request,
            &nodes_by_id,
            &downstream_edges_by_src,
            &aliases,
            llm_data.as_ref(),
        ))
    }

    pub async fn list_time_bound_grants(&self) -> Result<Vec<TimeBoundGrant>, AppError> {
        Ok(time_bound_grants::list(&self.db).await?)
    }
}
