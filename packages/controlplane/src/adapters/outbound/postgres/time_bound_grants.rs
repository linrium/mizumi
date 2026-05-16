use sqlx::PgPool;

use crate::domain::entities::permission::TimeBoundGrant;

pub async fn list(db: &PgPool) -> Result<Vec<TimeBoundGrant>, sqlx::Error> {
    sqlx::query_as::<_, TimeBoundGrant>(
        "SELECT * FROM time_bound_grants ORDER BY expires_at ASC",
    )
    .fetch_all(db)
    .await
}
