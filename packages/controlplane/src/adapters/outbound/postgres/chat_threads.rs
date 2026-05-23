use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::chat_thread::{ChatThread, ChatThreadSummary};

pub async fn list_for_user(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<ChatThreadSummary>, sqlx::Error> {
    sqlx::query_as::<_, ChatThreadSummary>(
        r#"
        SELECT id, title, last_message_preview, message_count, last_message_at, created_at, updated_at
        FROM chat_threads
        WHERE user_id = $1
        ORDER BY COALESCE(last_message_at, updated_at) DESC, created_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn get_for_user(
    db: &PgPool,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<ChatThread>, sqlx::Error> {
    sqlx::query_as::<_, ChatThread>(
        r#"
        SELECT id, title, last_message_preview, message_count, messages, last_message_at, created_at, updated_at
        FROM chat_threads
        WHERE user_id = $1 AND id = $2
        "#,
    )
    .bind(user_id)
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    title: &str,
    last_message_preview: &str,
    message_count: i32,
    messages: &Value,
    last_message_at: Option<DateTime<Utc>>,
) -> Result<ChatThread, sqlx::Error> {
    sqlx::query_as::<_, ChatThread>(
        r#"
        INSERT INTO chat_threads (
            user_id,
            title,
            last_message_preview,
            message_count,
            messages,
            last_message_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, last_message_preview, message_count, messages, last_message_at, created_at, updated_at
        "#,
    )
    .bind(user_id)
    .bind(title)
    .bind(last_message_preview)
    .bind(message_count)
    .bind(messages)
    .bind(last_message_at)
    .fetch_one(db)
    .await
}

pub async fn update(
    db: &PgPool,
    user_id: Uuid,
    id: Uuid,
    title: &str,
    last_message_preview: &str,
    message_count: i32,
    messages: &Value,
    last_message_at: Option<DateTime<Utc>>,
) -> Result<Option<ChatThread>, sqlx::Error> {
    sqlx::query_as::<_, ChatThread>(
        r#"
        UPDATE chat_threads
        SET
            title = $3,
            last_message_preview = $4,
            message_count = $5,
            messages = $6,
            last_message_at = $7,
            updated_at = NOW()
        WHERE user_id = $1 AND id = $2
        RETURNING id, title, last_message_preview, message_count, messages, last_message_at, created_at, updated_at
        "#,
    )
    .bind(user_id)
    .bind(id)
    .bind(title)
    .bind(last_message_preview)
    .bind(message_count)
    .bind(messages)
    .bind(last_message_at)
    .fetch_optional(db)
    .await
}

pub async fn delete_for_user(db: &PgPool, user_id: Uuid, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM chat_threads WHERE user_id = $1 AND id = $2")
        .bind(user_id)
        .bind(id)
        .execute(db)
        .await?;
    Ok(result.rows_affected() > 0)
}
