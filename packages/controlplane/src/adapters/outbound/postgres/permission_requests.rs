use sqlx::PgPool;

use crate::domain::entities::permission::PermissionRequest;

pub async fn list(db: &PgPool) -> Result<Vec<PermissionRequest>, sqlx::Error> {
    sqlx::query_as::<_, PermissionRequest>(
        "SELECT * FROM permission_requests ORDER BY submitted_at DESC",
    )
    .fetch_all(db)
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
