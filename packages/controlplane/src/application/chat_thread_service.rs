use chrono::Utc;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::chat_threads,
    domain::{
        entities::chat_thread::{
            ChatThread, ChatThreadSummary, CreateChatThreadBody, UpdateChatThreadBody,
        },
        error::AppError,
    },
};

const DEFAULT_CHAT_TITLE: &str = "New chat";

#[derive(Clone)]
pub struct ChatThreadService {
    db: PgPool,
}

impl ChatThreadService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn list_threads(&self, user_id: Uuid) -> Result<Vec<ChatThreadSummary>, AppError> {
        Ok(chat_threads::list_for_user(&self.db, user_id).await?)
    }

    pub async fn get_thread(&self, user_id: Uuid, id: Uuid) -> Result<ChatThread, AppError> {
        chat_threads::get_for_user(&self.db, user_id, id)
            .await?
            .ok_or(AppError::NotFound)
    }

    pub async fn create_thread(
        &self,
        user_id: Uuid,
        body: CreateChatThreadBody,
    ) -> Result<ChatThread, AppError> {
        let messages = normalize_messages(body.messages)?;
        let message_count = count_messages(&messages) as i32;
        let title = resolve_title(body.title, &messages, None)?;
        let preview = derive_last_message_preview(&messages).unwrap_or_default();
        let last_message_at = if message_count > 0 {
            Some(Utc::now())
        } else {
            None
        };

        Ok(chat_threads::create(
            &self.db,
            user_id,
            &title,
            &preview,
            message_count,
            &messages,
            last_message_at,
        )
        .await?)
    }

    pub async fn update_thread(
        &self,
        user_id: Uuid,
        id: Uuid,
        body: UpdateChatThreadBody,
    ) -> Result<ChatThread, AppError> {
        let existing = chat_threads::get_for_user(&self.db, user_id, id)
            .await?
            .ok_or(AppError::NotFound)?;

        let messages_changed = body.messages.is_some();
        let messages = match body.messages {
            Some(messages) => normalize_messages(Some(messages))?,
            None => existing.messages.clone(),
        };
        let message_count = count_messages(&messages) as i32;
        let title = resolve_title(body.title, &messages, Some(&existing.title))?;
        let preview = derive_last_message_preview(&messages).unwrap_or_default();
        let last_message_at = if messages_changed && message_count > 0 {
            Some(Utc::now())
        } else if message_count == 0 {
            None
        } else {
            existing.last_message_at
        };

        chat_threads::update(
            &self.db,
            user_id,
            id,
            &title,
            &preview,
            message_count,
            &messages,
            last_message_at,
        )
        .await?
        .ok_or(AppError::NotFound)
    }

    pub async fn delete_thread(&self, user_id: Uuid, id: Uuid) -> Result<(), AppError> {
        let deleted = chat_threads::delete_for_user(&self.db, user_id, id).await?;
        if !deleted {
            return Err(AppError::NotFound);
        }
        Ok(())
    }
}

fn normalize_messages(messages: Option<Value>) -> Result<Value, AppError> {
    let value = messages.unwrap_or_else(|| Value::Array(Vec::new()));
    if !value.is_array() {
        return Err(AppError::QueryFailed(
            "messages must be a JSON array".into(),
        ));
    }
    Ok(value)
}

fn resolve_title(
    requested_title: Option<String>,
    messages: &Value,
    existing_title: Option<&str>,
) -> Result<String, AppError> {
    if let Some(title) = requested_title {
        return sanitize_non_empty(&title, 80, "title");
    }

    if let Some(current) = existing_title {
        let trimmed = current.trim();
        if !trimmed.is_empty() && trimmed != DEFAULT_CHAT_TITLE {
            return Ok(trimmed.to_string());
        }
    }

    Ok(derive_title_from_messages(messages).unwrap_or_else(|| DEFAULT_CHAT_TITLE.to_string()))
}

fn sanitize_non_empty(value: &str, limit: usize, field: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::QueryFailed(format!("{field} cannot be empty")));
    }
    Ok(truncate(trimmed, limit))
}

fn count_messages(messages: &Value) -> usize {
    messages.as_array().map(Vec::len).unwrap_or(0)
}

fn derive_title_from_messages(messages: &Value) -> Option<String> {
    messages
        .as_array()?
        .iter()
        .find(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        .and_then(extract_message_text)
        .map(|text| truncate(&text, 80))
}

fn derive_last_message_preview(messages: &Value) -> Option<String> {
    messages
        .as_array()?
        .iter()
        .rev()
        .find_map(extract_message_text)
        .map(|text| truncate(&text, 140))
}

fn extract_message_text(message: &Value) -> Option<String> {
    let role = message
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("message");

    let text = message
        .get("parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| {
                    if part.get("type").and_then(Value::as_str) == Some("text") {
                        part.get("text").and_then(Value::as_str)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();

    let trimmed = text.trim();
    if !trimmed.is_empty() {
        return Some(trimmed.to_string());
    }

    Some(match role {
        "assistant" => "Assistant response".to_string(),
        "user" => "User message".to_string(),
        _ => "Message".to_string(),
    })
}

fn truncate(value: &str, limit: usize) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= limit {
        return value.to_string();
    }
    let head = chars
        .into_iter()
        .take(limit.saturating_sub(3))
        .collect::<String>();
    format!("{head}...")
}
