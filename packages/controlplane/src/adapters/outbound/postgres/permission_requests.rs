use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::permission::{PermissionApprovalStep, PermissionRequestView};

const DEFAULT_REVIEWER_ID: &str = "10000000-0000-0000-0000-000000000004";
const REQUEST_VIEW_SELECT: &str = r#"
    SELECT
        pr.id,
        pr.submit_as,
        pr.requester_id,
        requester.full_name AS requester,
        requester.email AS requester_email,
        pr.team AS team_id,
        team.name AS team,
        pr.resource,
        pr.scope,
        pr.privileges,
        pr.submitted_at,
        pr.expires_at,
        pr.status,
        pr.reviewer_id,
        reviewer.name AS reviewer,
        pr.rationale,
        pr.risk,
        pr.policy_template_id,
        pt.name AS policy_template_name,
        pt.resource AS policy_template_resource,
        pt.approval_mode AS policy_template_approval_mode,
        pt.owner_id AS policy_template_owner_id,
        template_owner.name AS policy_template_owner,
        pr.renewal_of,
        pr.created_at,
        pr.updated_at
    FROM permission_requests pr
    JOIN users requester ON requester.id = pr.requester_id
    LEFT JOIN teams team ON team.id = pr.team
    JOIN teams reviewer ON reviewer.id = pr.reviewer_id
    LEFT JOIN policy_templates pt ON pt.id = pr.policy_template_id
    LEFT JOIN teams template_owner ON template_owner.id = pt.owner_id
"#;

#[derive(Debug, Clone)]
pub struct NewApprovalStep {
    pub stage_order: i32,
    pub approver_team_id: Uuid,
    pub approver_label: String,
}

#[derive(Debug, sqlx::FromRow)]
struct PermissionRequestRow {
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
    pub renewal_of: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
struct ApprovalStepRow {
    pub id: Uuid,
    pub request_id: Uuid,
    pub stage_order: i32,
    pub approver_team_id: Uuid,
    pub approver_team: String,
    pub approver_label: String,
    pub status: String,
    pub acted_at: Option<DateTime<Utc>>,
}

fn map_request_row(row: PermissionRequestRow) -> PermissionRequestView {
    PermissionRequestView {
        id: row.id,
        submit_as: row.submit_as,
        requester_id: row.requester_id,
        requester: row.requester,
        requester_email: row.requester_email,
        team_id: row.team_id,
        team: row.team,
        resource: row.resource,
        scope: row.scope,
        privileges: row.privileges,
        submitted_at: row.submitted_at,
        expires_at: row.expires_at,
        status: row.status,
        reviewer_id: row.reviewer_id,
        reviewer: row.reviewer,
        rationale: row.rationale,
        risk: row.risk,
        policy_template_id: row.policy_template_id,
        policy_template_name: row.policy_template_name,
        policy_template_resource: row.policy_template_resource,
        policy_template_approval_mode: row.policy_template_approval_mode,
        policy_template_owner_id: row.policy_template_owner_id,
        policy_template_owner: row.policy_template_owner,
        renewal_of: row.renewal_of,
        created_at: row.created_at,
        updated_at: row.updated_at,
        approval_steps: Vec::new(),
    }
}

async fn attach_approval_steps(
    db: &PgPool,
    mut requests: Vec<PermissionRequestView>,
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    if requests.is_empty() {
        return Ok(requests);
    }

    let ids = requests
        .iter()
        .map(|request| request.id)
        .collect::<Vec<_>>();
    let steps = list_approval_steps(db, &ids).await?;

    for request in &mut requests {
        request.approval_steps = steps.get(&request.id).cloned().unwrap_or_default();
    }

    Ok(requests)
}

pub async fn list(
    db: &PgPool,
    resource: Option<&str>,
    viewer_id: Option<Uuid>,
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    let requests = match (resource, viewer_id) {
        (Some(r), Some(uid)) => {
            sqlx::query_as::<_, PermissionRequestRow>(&format!(
                "{REQUEST_VIEW_SELECT} WHERE (pr.requester_id = $1 OR pr.team IN (SELECT team_id FROM team_members WHERE user_id = $1)) AND pr.resource = $2 ORDER BY pr.submitted_at DESC"
            ))
            .bind(uid)
            .bind(r)
            .fetch_all(db)
            .await?
        }
        (Some(r), None) => {
            sqlx::query_as::<_, PermissionRequestRow>(&format!(
                "{REQUEST_VIEW_SELECT} WHERE pr.resource = $1 ORDER BY pr.submitted_at DESC"
            ))
            .bind(r)
            .fetch_all(db)
            .await?
        }
        (None, Some(uid)) => {
            sqlx::query_as::<_, PermissionRequestRow>(&format!(
                "{REQUEST_VIEW_SELECT} WHERE (pr.requester_id = $1 OR pr.team IN (SELECT team_id FROM team_members WHERE user_id = $1)) ORDER BY pr.submitted_at DESC"
            ))
            .bind(uid)
            .fetch_all(db)
            .await?
        }
        (None, None) => {
            sqlx::query_as::<_, PermissionRequestRow>(&format!(
                "{REQUEST_VIEW_SELECT} ORDER BY pr.submitted_at DESC"
            ))
            .fetch_all(db)
            .await?
        }
    }
    .into_iter()
    .map(map_request_row)
    .collect();

    attach_approval_steps(db, requests).await
}

pub async fn create(
    db: &PgPool,
    requester_id: Uuid,
    team: Option<Uuid>,
    resource: &str,
    scope: &str,
    privileges: &[String],
    rationale: &str,
    expires_at: chrono::DateTime<chrono::Utc>,
    renewal_of: Option<Uuid>,
) -> Result<PermissionRequestView, sqlx::Error> {
    let request = sqlx::query_as::<_, PermissionRequestRow>(&format!(
        r#"
        WITH inserted AS (
            INSERT INTO permission_requests (
                requester_id, team, resource, scope, privileges,
                submitted_at, expires_at, status, reviewer_id, rationale, risk, submit_as,
                renewal_of
            ) VALUES (
                $1, $2, $3, $4, $5,
                NOW(), $9, 'pending',
                $7::uuid, $6, 'low', $8,
                $10
            )
            RETURNING *
        )
        SELECT
            inserted.id,
            inserted.submit_as,
            inserted.requester_id,
            requester.full_name AS requester,
            requester.email AS requester_email,
            inserted.team AS team_id,
            team.name AS team,
            inserted.resource,
            inserted.scope,
            inserted.privileges,
            inserted.submitted_at,
            inserted.expires_at,
            inserted.status,
            inserted.reviewer_id,
            reviewer.name AS reviewer,
            inserted.rationale,
            inserted.risk,
            inserted.policy_template_id,
            pt.name AS policy_template_name,
            pt.resource AS policy_template_resource,
            pt.approval_mode AS policy_template_approval_mode,
            pt.owner_id AS policy_template_owner_id,
            template_owner.name AS policy_template_owner,
            inserted.renewal_of,
            inserted.created_at,
            inserted.updated_at
        FROM inserted
        JOIN users requester ON requester.id = inserted.requester_id
        LEFT JOIN teams team ON team.id = inserted.team
        JOIN teams reviewer ON reviewer.id = inserted.reviewer_id
        LEFT JOIN policy_templates pt ON pt.id = inserted.policy_template_id
        LEFT JOIN teams template_owner ON template_owner.id = pt.owner_id
        "#
    ))
    .bind(requester_id)
    .bind(team)
    .bind(resource)
    .bind(scope)
    .bind(privileges)
    .bind(rationale)
    .bind(DEFAULT_REVIEWER_ID)
    .bind(if team.is_some() { "team" } else { "personal" })
    .bind(expires_at)
    .bind(renewal_of)
    .fetch_one(db)
    .await
    .map(map_request_row)?;

    attach_approval_steps(db, vec![request])
        .await
        .map(|mut requests| requests.remove(0))
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<PermissionRequestView>, sqlx::Error> {
    let request = sqlx::query_as::<_, PermissionRequestRow>(&format!(
        r#"
        {REQUEST_VIEW_SELECT}
        WHERE pr.id = $1
        "#,
    ))
    .bind(id)
    .fetch_optional(db)
    .await?
    .map(map_request_row);

    match request {
        Some(request) => attach_approval_steps(db, vec![request])
            .await
            .map(|mut requests| requests.pop()),
        None => Ok(None),
    }
}

pub async fn update_status_and_reviewer(
    db: &PgPool,
    id: Uuid,
    status: &str,
    reviewer_id: Uuid,
) -> Result<Option<PermissionRequestView>, sqlx::Error> {
    let request = sqlx::query_as::<_, PermissionRequestRow>(&format!(
        r#"
        WITH updated AS (
            UPDATE permission_requests
            SET status = $1, reviewer_id = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING *
        )
        SELECT
            updated.id,
            updated.requester_id,
            requester.full_name AS requester,
            requester.email AS requester_email,
            updated.submit_as,
            updated.team AS team_id,
            team.name AS team,
            updated.resource,
            updated.scope,
            updated.privileges,
            updated.submitted_at,
            updated.expires_at,
            updated.status,
            updated.reviewer_id,
            reviewer.name AS reviewer,
            updated.rationale,
            updated.risk,
            updated.policy_template_id,
            pt.name AS policy_template_name,
            pt.resource AS policy_template_resource,
            pt.approval_mode AS policy_template_approval_mode,
            pt.owner_id AS policy_template_owner_id,
            template_owner.name AS policy_template_owner,
            updated.renewal_of,
            updated.created_at,
            updated.updated_at
        FROM updated
        JOIN users requester ON requester.id = updated.requester_id
        LEFT JOIN teams team ON team.id = updated.team
        JOIN teams reviewer ON reviewer.id = updated.reviewer_id
        LEFT JOIN policy_templates pt ON pt.id = updated.policy_template_id
        LEFT JOIN teams template_owner ON template_owner.id = pt.owner_id
        "#
    ))
    .bind(status)
    .bind(reviewer_id)
    .bind(id)
    .fetch_optional(db)
    .await?
    .map(map_request_row);

    match request {
        Some(request) => attach_approval_steps(db, vec![request])
            .await
            .map(|mut requests| requests.pop()),
        None => Ok(None),
    }
}

pub async fn bulk_update_status(
    db: &PgPool,
    ids: &[Uuid],
    status: &str,
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    let requests = sqlx::query_as::<_, PermissionRequestRow>(&format!(
        r#"
        WITH updated AS (
            UPDATE permission_requests
            SET status = $1, updated_at = NOW()
            WHERE id = ANY($2)
            RETURNING *
        )
        SELECT
            updated.id,
            updated.requester_id,
            requester.full_name AS requester,
            requester.email AS requester_email,
            updated.submit_as,
            updated.team AS team_id,
            team.name AS team,
            updated.resource,
            updated.scope,
            updated.privileges,
            updated.submitted_at,
            updated.expires_at,
            updated.status,
            updated.reviewer_id,
            reviewer.name AS reviewer,
            updated.rationale,
            updated.risk,
            updated.policy_template_id,
            pt.name AS policy_template_name,
            pt.resource AS policy_template_resource,
            pt.approval_mode AS policy_template_approval_mode,
            pt.owner_id AS policy_template_owner_id,
            template_owner.name AS policy_template_owner,
            updated.renewal_of,
            updated.created_at,
            updated.updated_at
        FROM updated
        JOIN users requester ON requester.id = updated.requester_id
        LEFT JOIN teams team ON team.id = updated.team
        JOIN teams reviewer ON reviewer.id = updated.reviewer_id
        LEFT JOIN policy_templates pt ON pt.id = updated.policy_template_id
        LEFT JOIN teams template_owner ON template_owner.id = pt.owner_id
        ORDER BY updated.submitted_at DESC
        "#
    ))
    .bind(status)
    .bind(ids)
    .fetch_all(db)
    .await?
    .into_iter()
    .map(map_request_row)
    .collect();

    attach_approval_steps(db, requests).await
}

pub async fn list_by_ids(
    db: &PgPool,
    ids: &[Uuid],
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    let requests = sqlx::query_as::<_, PermissionRequestRow>(&format!(
        "{REQUEST_VIEW_SELECT} WHERE pr.id = ANY($1) ORDER BY pr.submitted_at DESC"
    ))
    .bind(ids)
    .fetch_all(db)
    .await?
    .into_iter()
    .map(map_request_row)
    .collect();

    attach_approval_steps(db, requests).await
}

pub async fn update_policy_metadata(
    db: &PgPool,
    id: Uuid,
    policy_template_id: Option<Uuid>,
    reviewer_id: Uuid,
    risk: &str,
    status: &str,
) -> Result<Option<PermissionRequestView>, sqlx::Error> {
    let request = sqlx::query_as::<_, PermissionRequestRow>(&format!(
        r#"
        WITH updated AS (
            UPDATE permission_requests
            SET policy_template_id = $1,
                reviewer_id = $2,
                risk = $3,
                status = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
        )
        SELECT
            updated.id,
            updated.requester_id,
            requester.full_name AS requester,
            requester.email AS requester_email,
            updated.submit_as,
            updated.team AS team_id,
            team.name AS team,
            updated.resource,
            updated.scope,
            updated.privileges,
            updated.submitted_at,
            updated.expires_at,
            updated.status,
            updated.reviewer_id,
            reviewer.name AS reviewer,
            updated.rationale,
            updated.risk,
            updated.policy_template_id,
            pt.name AS policy_template_name,
            pt.resource AS policy_template_resource,
            pt.approval_mode AS policy_template_approval_mode,
            pt.owner_id AS policy_template_owner_id,
            template_owner.name AS policy_template_owner,
            updated.renewal_of,
            updated.created_at,
            updated.updated_at
        FROM updated
        JOIN users requester ON requester.id = updated.requester_id
        LEFT JOIN teams team ON team.id = updated.team
        JOIN teams reviewer ON reviewer.id = updated.reviewer_id
        LEFT JOIN policy_templates pt ON pt.id = updated.policy_template_id
        LEFT JOIN teams template_owner ON template_owner.id = pt.owner_id
        "#
    ))
    .bind(policy_template_id)
    .bind(reviewer_id)
    .bind(risk)
    .bind(status)
    .bind(id)
    .fetch_optional(db)
    .await?
    .map(map_request_row);

    match request {
        Some(request) => attach_approval_steps(db, vec![request])
            .await
            .map(|mut requests| requests.pop()),
        None => Ok(None),
    }
}

pub async fn replace_approval_steps(
    db: &PgPool,
    request_id: Uuid,
    steps: &[NewApprovalStep],
) -> Result<Vec<PermissionApprovalStep>, sqlx::Error> {
    sqlx::query("DELETE FROM permission_request_approval_steps WHERE request_id = $1")
        .bind(request_id)
        .execute(db)
        .await?;

    for step in steps {
        let initial_status = if step.stage_order == 1 {
            "pending"
        } else {
            "waiting"
        };
        sqlx::query(
            r#"
            INSERT INTO permission_request_approval_steps (
                request_id,
                stage_order,
                approver_team_id,
                approver_label,
                status
            ) VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(request_id)
        .bind(step.stage_order)
        .bind(step.approver_team_id)
        .bind(&step.approver_label)
        .bind(initial_status)
        .execute(db)
        .await?;
    }

    list_approval_steps(db, &[request_id])
        .await
        .map(|steps_by_request| {
            steps_by_request
                .get(&request_id)
                .cloned()
                .unwrap_or_default()
        })
}

pub async fn list_approval_steps(
    db: &PgPool,
    request_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<PermissionApprovalStep>>, sqlx::Error> {
    if request_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = sqlx::query_as::<_, ApprovalStepRow>(
        r#"
        SELECT
            pras.id,
            pras.request_id,
            pras.stage_order,
            pras.approver_team_id,
            team.name AS approver_team,
            pras.approver_label,
            pras.status,
            pras.acted_at
        FROM permission_request_approval_steps pras
        JOIN teams team ON team.id = pras.approver_team_id
        WHERE pras.request_id = ANY($1)
        ORDER BY pras.request_id ASC, pras.stage_order ASC, team.name ASC
        "#,
    )
    .bind(request_ids)
    .fetch_all(db)
    .await?;

    let current_stage_by_request =
        rows.iter()
            .filter(|row| row.status == "pending")
            .fold(HashMap::new(), |mut acc, row| {
                acc.entry(row.request_id)
                    .and_modify(|stage: &mut i32| {
                        if row.stage_order < *stage {
                            *stage = row.stage_order;
                        }
                    })
                    .or_insert(row.stage_order);
                acc
            });

    let mut steps_by_request = HashMap::<Uuid, Vec<PermissionApprovalStep>>::new();
    for row in rows {
        let current_stage = current_stage_by_request.get(&row.request_id).copied();
        let status = row.status;
        steps_by_request
            .entry(row.request_id)
            .or_default()
            .push(PermissionApprovalStep {
                id: row.id,
                stage_order: row.stage_order,
                approver_team_id: row.approver_team_id,
                approver_team: row.approver_team,
                approver_label: row.approver_label,
                status: status.clone(),
                acted_at: row.acted_at,
                is_current: current_stage == Some(row.stage_order) && status == "pending",
            });
    }

    Ok(steps_by_request)
}

pub async fn mark_approval_step(
    db: &PgPool,
    request_id: Uuid,
    approval_step_id: Uuid,
    status: &str,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query(
        r#"
        UPDATE permission_request_approval_steps
        SET status = $1,
            acted_at = NOW(),
            updated_at = NOW()
        WHERE request_id = $2
          AND id = $3
          AND status = 'pending'
        "#,
    )
    .bind(status)
    .bind(request_id)
    .bind(approval_step_id)
    .execute(db)
    .await?
    .rows_affected();

    Ok(updated > 0)
}

pub async fn cancel_open_steps(db: &PgPool, request_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE permission_request_approval_steps
        SET status = 'cancelled',
            acted_at = COALESCE(acted_at, NOW()),
            updated_at = NOW()
        WHERE request_id = $1
          AND status IN ('waiting', 'pending')
        "#,
    )
    .bind(request_id)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn approve_all_steps(db: &PgPool, request_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE permission_request_approval_steps
        SET status = 'approved',
            acted_at = COALESCE(acted_at, NOW()),
            updated_at = NOW()
        WHERE request_id = $1
          AND status IN ('waiting', 'pending', 'needs-info')
        "#,
    )
    .bind(request_id)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn activate_next_stage_if_ready(
    db: &PgPool,
    request_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        WITH next_stage AS (
            SELECT MIN(stage_order) AS stage_order
            FROM permission_request_approval_steps
            WHERE request_id = $1
              AND status = 'waiting'
        )
        UPDATE permission_request_approval_steps pras
        SET status = 'pending',
            updated_at = NOW()
        FROM next_stage
        WHERE pras.request_id = $1
          AND pras.stage_order = next_stage.stage_order
          AND pras.status = 'waiting'
          AND NOT EXISTS (
              SELECT 1
              FROM permission_request_approval_steps blocking
              WHERE blocking.request_id = $1
                AND blocking.stage_order < next_stage.stage_order
                AND blocking.status != 'approved'
          )
        "#,
    )
    .bind(request_id)
    .execute(db)
    .await?;

    Ok(())
}
