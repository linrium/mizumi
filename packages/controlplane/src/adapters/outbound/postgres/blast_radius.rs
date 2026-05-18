use std::collections::HashMap;

use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct BlastRadiusLlmData {
    pub recommended_guardrail: String,
    pub llm_risk: String,
    pub llm_recommended_guardrail: String,
}

pub async fn upsert_processing(db: &PgPool, request_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO blast_radius_previews (request_id, llm_risk)
        VALUES ($1, 'processing')
        ON CONFLICT (request_id)
        DO UPDATE SET llm_risk = 'processing', llm_recommended_guardrail = '', updated_at = NOW()
        "#,
    )
    .bind(request_id)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn update_llm_result(
    db: &PgPool,
    request_id: Uuid,
    llm_guardrail: &str,
    llm_risk: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE blast_radius_previews
        SET llm_recommended_guardrail = $2,
            llm_risk                  = $3,
            updated_at                = NOW()
        WHERE request_id = $1
        "#,
    )
    .bind(request_id)
    .bind(llm_guardrail)
    .bind(llm_risk)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn get_llm_data(
    db: &PgPool,
    request_id: Uuid,
) -> Result<Option<BlastRadiusLlmData>, sqlx::Error> {
    sqlx::query_as::<_, (String, String, String)>(
        r#"
        SELECT recommended_guardrail, llm_risk, llm_recommended_guardrail
        FROM blast_radius_previews
        WHERE request_id = $1
        "#,
    )
    .bind(request_id)
    .fetch_optional(db)
    .await
    .map(|row| {
        row.map(|(recommended_guardrail, llm_risk, llm_recommended_guardrail)| {
            BlastRadiusLlmData {
                recommended_guardrail,
                llm_risk,
                llm_recommended_guardrail,
            }
        })
    })
}

pub async fn list_llm_data(db: &PgPool) -> Result<HashMap<Uuid, BlastRadiusLlmData>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (Uuid, String, String, String)>(
        r#"
        SELECT request_id, recommended_guardrail, llm_risk, llm_recommended_guardrail
        FROM blast_radius_previews
        "#,
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, recommended_guardrail, llm_risk, llm_recommended_guardrail)| {
            (
                id,
                BlastRadiusLlmData {
                    recommended_guardrail,
                    llm_risk,
                    llm_recommended_guardrail,
                },
            )
        })
        .collect())
}

