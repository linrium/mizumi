use sqlx::PgPool;

use crate::domain::entities::permission::PermissionRequest;

pub async fn list(
    db: &PgPool,
    resource: Option<&str>,
) -> Result<Vec<PermissionRequest>, sqlx::Error> {
    match resource {
        Some(r) => {
            sqlx::query_as::<_, PermissionRequest>(
                "SELECT * FROM permission_requests WHERE resource = $1 ORDER BY submitted_at DESC",
            )
            .bind(r)
            .fetch_all(db)
            .await
        }
        None => {
            sqlx::query_as::<_, PermissionRequest>(
                "SELECT * FROM permission_requests ORDER BY submitted_at DESC",
            )
            .fetch_all(db)
            .await
        }
    }
}

pub async fn create(
    db: &PgPool,
    requester: &str,
    team: &str,
    resource: &str,
    scope: &str,
    privileges: &[String],
    rationale: &str,
) -> Result<PermissionRequest, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequest>(
        r#"
        INSERT INTO permission_requests (
            id, requester, team, resource, scope, privileges,
            submitted_at, expires_at, status, reviewer, rationale, risk
        ) VALUES (
            'PR-' || nextval('permission_request_seq')::text,
            $1, $2, $3, $4, $5,
            NOW(), NOW() + INTERVAL '7 days', 'pending', 'Data Platform', $6, 'low'
        ) RETURNING *
        "#,
    )
    .bind(requester)
    .bind(team)
    .bind(resource)
    .bind(scope)
    .bind(privileges)
    .bind(rationale)
    .fetch_one(db)
    .await
}

pub async fn get(db: &PgPool, id: &str) -> Result<Option<PermissionRequest>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequest>(
        "SELECT * FROM permission_requests WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn update_status(
    db: &PgPool,
    id: &str,
    status: &str,
) -> Result<Option<PermissionRequest>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequest>(
        "UPDATE permission_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    )
    .bind(status)
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn bulk_update_status(
    db: &PgPool,
    ids: &[String],
    status: &str,
) -> Result<Vec<PermissionRequest>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequest>(
        "UPDATE permission_requests SET status = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING *",
    )
    .bind(status)
    .bind(ids)
    .fetch_all(db)
    .await
}
