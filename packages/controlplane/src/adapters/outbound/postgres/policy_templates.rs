use std::collections::HashMap;

use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::permission::{PolicyTemplate, PolicyTemplateApprovalStep};

#[derive(sqlx::FromRow)]
struct PolicyTemplateRow {
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
    pub last_updated: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(sqlx::FromRow)]
struct PolicyTemplateApprovalStepRow {
    pub id: Uuid,
    pub policy_template_id: Uuid,
    pub stage_order: i32,
    pub approver_team_id: Uuid,
    pub approver_team: String,
    pub approver_label: String,
}

fn map_template_row(row: PolicyTemplateRow) -> PolicyTemplate {
    PolicyTemplate {
        id: row.id,
        name: row.name,
        scope: row.scope,
        resource: row.resource,
        team_ids: row.team_ids,
        teams: row.teams,
        privileges: row.privileges,
        approval_mode: row.approval_mode,
        risk: row.risk,
        usage_30d: row.usage_30d,
        owner_id: row.owner_id,
        owner: row.owner,
        last_updated: row.last_updated,
        created_at: row.created_at,
        updated_at: row.updated_at,
        approval_steps: Vec::new(),
    }
}

pub async fn list(db: &PgPool) -> Result<Vec<PolicyTemplate>, sqlx::Error> {
    let mut templates = sqlx::query_as::<_, PolicyTemplateRow>(
        r#"
        SELECT
            pt.id,
            pt.name,
            pt.scope,
            pt.resource,
            pt.team_ids,
            COALESCE(
                ARRAY(
                    SELECT team.name
                    FROM teams team
                    WHERE team.id = ANY(pt.team_ids)
                    ORDER BY team.name
                ),
                '{}'
            ) AS teams,
            pt.privileges,
            pt.approval_mode,
            pt.risk,
            pt.usage_30d,
            pt.owner_id,
            owner.name AS owner,
            pt.last_updated,
            pt.created_at,
            pt.updated_at
        FROM policy_templates pt
        JOIN teams owner ON owner.id = pt.owner_id
        ORDER BY pt.last_updated DESC
        "#,
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(map_template_row)
    .collect::<Vec<_>>();

    if templates.is_empty() {
        return Ok(templates);
    }

    let ids = templates
        .iter()
        .map(|template| template.id)
        .collect::<Vec<_>>();
    let steps = list_approval_steps(db, &ids).await?;

    for template in &mut templates {
        template.approval_steps = steps.get(&template.id).cloned().unwrap_or_default();
    }

    Ok(templates)
}

pub async fn list_approval_steps(
    db: &PgPool,
    template_ids: &[Uuid],
) -> Result<HashMap<Uuid, Vec<PolicyTemplateApprovalStep>>, sqlx::Error> {
    if template_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = sqlx::query_as::<_, PolicyTemplateApprovalStepRow>(
        r#"
        SELECT
            ptas.id,
            ptas.policy_template_id,
            ptas.stage_order,
            ptas.approver_team_id,
            team.name AS approver_team,
            ptas.approver_label
        FROM policy_template_approval_steps ptas
        JOIN teams team ON team.id = ptas.approver_team_id
        WHERE ptas.policy_template_id = ANY($1)
        ORDER BY ptas.policy_template_id ASC, ptas.stage_order ASC, team.name ASC
        "#,
    )
    .bind(template_ids)
    .fetch_all(db)
    .await?;

    let mut steps_by_template = HashMap::<Uuid, Vec<PolicyTemplateApprovalStep>>::new();
    for row in rows {
        steps_by_template
            .entry(row.policy_template_id)
            .or_default()
            .push(PolicyTemplateApprovalStep {
                id: row.id,
                stage_order: row.stage_order,
                approver_team_id: row.approver_team_id,
                approver_team: row.approver_team,
                approver_label: row.approver_label,
            });
    }

    Ok(steps_by_template)
}
