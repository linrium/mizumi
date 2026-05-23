use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ChatThreadSummary {
    pub id: Uuid,
    pub title: String,
    pub last_message_preview: String,
    pub message_count: i32,
    pub last_message_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ChatThread {
    pub id: Uuid,
    pub title: String,
    pub last_message_preview: String,
    pub message_count: i32,
    pub messages: Value,
    pub last_message_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChatThreadBody {
    pub title: Option<String>,
    pub messages: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChatThreadBody {
    pub title: Option<String>,
    pub messages: Option<Value>,
}
