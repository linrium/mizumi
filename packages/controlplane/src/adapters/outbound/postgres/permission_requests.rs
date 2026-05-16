use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::permission::PermissionRequestView;

const DEFAULT_REVIEWER_ID: &str = "10000000-0000-0000-0000-000000000011";
const REQUEST_VIEW_SELECT: &str = r#"
    SELECT
        pr.id,
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
        pr.created_at,
        pr.updated_at
    FROM permission_requests pr
    JOIN users requester ON requester.id = pr.requester_id
    JOIN teams team ON team.id = pr.team
    JOIN teams reviewer ON reviewer.id = pr.reviewer_id
"#;

pub async fn list(
    db: &PgPool,
    resource: Option<&str>,
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    match resource {
        Some(r) => {
            sqlx::query_as::<_, PermissionRequestView>(&format!(
                "{REQUEST_VIEW_SELECT} WHERE pr.resource = $1 ORDER BY pr.submitted_at DESC"
            ))
            .bind(r)
            .fetch_all(db)
            .await
        }
        None => {
            sqlx::query_as::<_, PermissionRequestView>(&format!(
                "{REQUEST_VIEW_SELECT} ORDER BY pr.submitted_at DESC"
            ))
            .fetch_all(db)
            .await
        }
    }
}

pub async fn create(
    db: &PgPool,
    requester_id: Uuid,
    team: Uuid,
    resource: &str,
    scope: &str,
    privileges: &[String],
    rationale: &str,
) -> Result<PermissionRequestView, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequestView>(&format!(
        r#"
        WITH inserted AS (
            INSERT INTO permission_requests (
                requester_id, team, resource, scope, privileges,
                submitted_at, expires_at, status, reviewer_id, rationale, risk
            ) VALUES (
                $1, $2, $3, $4, $5,
                NOW(), NOW() + INTERVAL '7 days', 'pending',
                $7::uuid, $6, 'low'
            )
            RETURNING *
        )
        SELECT
            inserted.id,
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
            inserted.created_at,
            inserted.updated_at
        FROM inserted
        JOIN users requester ON requester.id = inserted.requester_id
        JOIN teams team ON team.id = inserted.team
        JOIN teams reviewer ON reviewer.id = inserted.reviewer_id
        "#
    ))
    .bind(requester_id)
    .bind(team)
    .bind(resource)
    .bind(scope)
    .bind(privileges)
    .bind(rationale)
    .bind(DEFAULT_REVIEWER_ID)
    .fetch_one(db)
    .await
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<PermissionRequestView>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequestView>(&format!(
        r#"
        {REQUEST_VIEW_SELECT}
        WHERE pr.id = $1
        "#,
    ))
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn update_status(
    db: &PgPool,
    id: Uuid,
    status: &str,
) -> Result<Option<PermissionRequestView>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequestView>(&format!(
        r#"
        WITH updated AS (
            UPDATE permission_requests
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        )
        SELECT
            updated.id,
            updated.requester_id,
            requester.full_name AS requester,
            requester.email AS requester_email,
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
            updated.created_at,
            updated.updated_at
        FROM updated
        JOIN users requester ON requester.id = updated.requester_id
        JOIN teams team ON team.id = updated.team
        JOIN teams reviewer ON reviewer.id = updated.reviewer_id
        "#
    ))
    .bind(status)
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn bulk_update_status(
    db: &PgPool,
    ids: &[Uuid],
    status: &str,
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequestView>(&format!(
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
            updated.created_at,
            updated.updated_at
        FROM updated
        JOIN users requester ON requester.id = updated.requester_id
        JOIN teams team ON team.id = updated.team
        JOIN teams reviewer ON reviewer.id = updated.reviewer_id
        ORDER BY updated.submitted_at DESC
        "#
    ))
    .bind(status)
    .bind(ids)
    .fetch_all(db)
    .await
}

pub async fn list_by_ids(
    db: &PgPool,
    ids: &[Uuid],
) -> Result<Vec<PermissionRequestView>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequestView>(&format!(
        "{REQUEST_VIEW_SELECT} WHERE pr.id = ANY($1) ORDER BY pr.submitted_at DESC"
    ))
    .bind(ids)
    .fetch_all(db)
    .await
}
