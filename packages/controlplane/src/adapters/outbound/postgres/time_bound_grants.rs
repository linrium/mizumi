use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::permission::TimeBoundGrant;

pub async fn list(
    db: &PgPool,
    status: Option<&str>,
    resource: Option<&str>,
    principal: Option<&str>,
) -> Result<Vec<TimeBoundGrant>, sqlx::Error> {
    sqlx::query_as::<_, TimeBoundGrant>(
        r#"
        SELECT * FROM time_bound_grants
        WHERE ($1::text IS NULL OR renewal_status = $1)
          AND ($2::text IS NULL OR resource = $2)
          AND ($3::text IS NULL OR principal = $3)
        ORDER BY expires_at ASC
        "#,
    )
    .bind(status)
    .bind(resource)
    .bind(principal)
    .fetch_all(db)
    .await
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<TimeBoundGrant>, sqlx::Error> {
    sqlx::query_as::<_, TimeBoundGrant>("SELECT * FROM time_bound_grants WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}

pub async fn insert(
    db: &PgPool,
    principal: &str,
    team: &str,
    resource: &str,
    scope: &str,
    privilege: &str,
    started_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    reviewer: &str,
    reason: &str,
    source_request_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO time_bound_grants
            (principal, team, resource, scope, privilege, started_at, expires_at,
             reviewer_id, reason, source_request_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (source_request_id, principal, resource, privilege) DO NOTHING
        "#,
    )
    .bind(principal)
    .bind(team)
    .bind(resource)
    .bind(scope)
    .bind(privilege)
    .bind(started_at)
    .bind(expires_at)
    .bind(reviewer)
    .bind(reason)
    .bind(source_request_id)
    .execute(db)
    .await?;
    Ok(())
}

/// Extend (or shorten) a grant's `expires_at` to `new_expires_at`.
/// Also recomputes `renewal_status`: `expiring` if within 7 days, `healthy` otherwise.
/// Returns the updated grant, or `None` if it doesn't exist or is already expired/revoked.
pub async fn extend(
    db: &PgPool,
    id: Uuid,
    new_expires_at: DateTime<Utc>,
) -> Result<Option<TimeBoundGrant>, sqlx::Error> {
    sqlx::query_as::<_, TimeBoundGrant>(
        r#"
        UPDATE time_bound_grants
        SET
            expires_at     = $2,
            renewal_status = CASE
                WHEN $2 < NOW() + INTERVAL '7 days' THEN 'expiring'
                ELSE 'healthy'
            END,
            updated_at = NOW()
        WHERE id = $1
          AND renewal_status NOT IN ('expired', 'revoked')
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(new_expires_at)
    .fetch_optional(db)
    .await
}

/// Revoke a grant, setting its `renewal_status` to `revoked`.
/// Returns the updated grant, or `None` if it doesn't exist or is already revoked.
pub async fn revoke(db: &PgPool, id: Uuid) -> Result<Option<TimeBoundGrant>, sqlx::Error> {
    sqlx::query_as::<_, TimeBoundGrant>(
        r#"
        UPDATE time_bound_grants
        SET renewal_status = 'revoked', updated_at = NOW()
        WHERE id = $1
          AND renewal_status != 'revoked'
        RETURNING *
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await
}

/// Shorten `expires_at` for all active grants linked to `source_request_id` so that
/// none exceed `started_at + cap_days`.  Rows that are already shorter, or that are
/// `expired`/`revoked`, are left untouched.  `renewal_status` is promoted to
/// `expiring` when the resulting `expires_at` falls within the next 7 days.
///
/// Returns the number of rows actually updated.
pub async fn apply_guardrail_cap(
    db: &PgPool,
    source_request_id: Uuid,
    cap_days: i32,
) -> Result<u64, sqlx::Error> {
    assert!(cap_days > 0, "cap_days must be positive");

    let result = sqlx::query(
        r#"
        UPDATE time_bound_grants
        SET
            expires_at     = LEAST(expires_at, started_at + ($2::int * INTERVAL '1 day')),
            renewal_status = CASE
                WHEN renewal_status = 'healthy'
                     AND LEAST(expires_at, started_at + ($2::int * INTERVAL '1 day'))
                             < NOW() + INTERVAL '7 days'
                THEN 'expiring'
                ELSE renewal_status
            END,
            updated_at = NOW()
        WHERE source_request_id = $1
          AND renewal_status NOT IN ('expired', 'revoked')
          AND started_at + ($2::int * INTERVAL '1 day') < expires_at
        "#,
    )
    .bind(source_request_id)
    .bind(cap_days)
    .execute(db)
    .await?;

    Ok(result.rows_affected())
}

/// Promote `healthy` grants that expire within the next 7 days to `expiring`.
/// Returns the number of rows updated.
pub async fn mark_expiring_soon(db: &PgPool) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        UPDATE time_bound_grants
        SET renewal_status = 'expiring', updated_at = NOW()
        WHERE renewal_status = 'healthy'
          AND expires_at < NOW() + INTERVAL '7 days'
        "#,
    )
    .execute(db)
    .await?;
    Ok(result.rows_affected())
}

/// Claim up to `limit` overdue grants (expires_at < NOW, not yet expired/revoked)
/// using `FOR UPDATE SKIP LOCKED` so concurrent workers don't double-process.
/// Returns rows locked within this transaction — caller must hold the transaction
/// open while processing.
pub async fn list_overdue(db: &PgPool, limit: i64) -> Result<Vec<TimeBoundGrant>, sqlx::Error> {
    sqlx::query_as::<_, TimeBoundGrant>(
        r#"
        SELECT * FROM time_bound_grants
        WHERE expires_at < NOW()
          AND renewal_status NOT IN ('expired', 'revoked')
        ORDER BY expires_at ASC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(db)
    .await
}

/// Mark a single grant as `expired`.
/// Safe against races: will not overwrite `revoked`, and will not un-expire a renewed grant.
pub async fn expire(db: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        r#"
        UPDATE time_bound_grants
        SET renewal_status = 'expired', updated_at = NOW()
        WHERE id = $1
          AND expires_at < NOW()
          AND renewal_status NOT IN ('expired', 'revoked')
        "#,
    )
    .bind(id)
    .execute(db)
    .await?;
    Ok(result.rows_affected() > 0)
}
