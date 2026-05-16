use sqlx::PgPool;

use crate::domain::entities::permission::PolicyTemplate;

pub async fn list(db: &PgPool) -> Result<Vec<PolicyTemplate>, sqlx::Error> {
    sqlx::query_as::<_, PolicyTemplate>("SELECT * FROM policy_templates ORDER BY last_updated DESC")
        .fetch_all(db)
        .await
}
