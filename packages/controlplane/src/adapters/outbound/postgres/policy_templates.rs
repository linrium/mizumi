use sqlx::PgPool;

use crate::domain::entities::permission::PolicyTemplate;

pub async fn list(db: &PgPool) -> Result<Vec<PolicyTemplate>, sqlx::Error> {
    sqlx::query_as::<_, PolicyTemplate>(
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
    .await
}
