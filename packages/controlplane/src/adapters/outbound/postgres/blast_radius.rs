use sqlx::PgPool;

use crate::domain::entities::permission::BlastRadiusPreviewRow;

pub async fn list(db: &PgPool) -> Result<Vec<BlastRadiusPreviewRow>, sqlx::Error> {
    sqlx::query_as::<_, BlastRadiusPreviewRow>(
        r#"
        SELECT
            br.request_id,
            pr.requester_id,
            pr.resource,
            pr.scope,
            pr.risk,
            br.downstream_assets,
            br.dashboards,
            br.consumers,
            br.sensitive_domains,
            br.recommended_guardrail
        FROM blast_radius_previews br
        JOIN permission_requests pr ON br.request_id = pr.id
        ORDER BY pr.submitted_at DESC
        "#,
    )
    .fetch_all(db)
    .await
}
