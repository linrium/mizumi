use std::collections::HashMap;
use sqlx::PgPool;
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose};
use crate::domain::error::DomainError;

pub mod catalog;
pub mod schema;
pub mod table;
pub mod volume;
pub mod function;
pub mod model;
pub mod metastore;
pub mod permissions;
pub mod user;

#[derive(sqlx::FromRow)]
pub(super) struct PropertyRow {
    pub property_key: String,
    pub property_value: Option<String>,
}

pub(super) fn encode_page_token(name: &str) -> String {
    general_purpose::STANDARD.encode(name.as_bytes())
}

pub(super) fn decode_page_token(token: &str) -> Result<String, DomainError> {
    let bytes = general_purpose::STANDARD
        .decode(token)
        .map_err(|e| DomainError::InvalidArgument(format!("Invalid page token: {}", e)))?;
    String::from_utf8(bytes)
        .map_err(|e| DomainError::InvalidArgument(format!("Invalid page token encoding: {}", e)))
}

pub(super) async fn fetch_properties(
    pool: &PgPool,
    entity_id: Uuid,
    entity_type: &str,
) -> Result<Option<HashMap<String, String>>, DomainError> {
    let rows = sqlx::query_as::<_, PropertyRow>(
        "SELECT property_key, property_value FROM uc_properties WHERE entity_id = $1 AND entity_type = $2",
    )
    .bind(entity_id)
    .bind(entity_type)
    .fetch_all(pool)
    .await
    .map_err(|e| DomainError::Internal(e.to_string()))?;

    if rows.is_empty() {
        Ok(None)
    } else {
        let map: HashMap<String, String> = rows
            .into_iter()
            .filter_map(|r| r.property_value.map(|v| (r.property_key, v)))
            .collect();
        Ok(if map.is_empty() { None } else { Some(map) })
    }
}

pub(super) async fn upsert_properties(
    pool: &PgPool,
    entity_id: Uuid,
    entity_type: &str,
    properties: &HashMap<String, String>,
) -> Result<(), DomainError> {
    for (key, value) in properties {
        sqlx::query(
            "INSERT INTO uc_properties (entity_id, entity_type, property_key, property_value)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (entity_id, entity_type, property_key)
             DO UPDATE SET property_value = EXCLUDED.property_value",
        )
        .bind(entity_id)
        .bind(entity_type)
        .bind(key)
        .bind(value)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
    }
    Ok(())
}

pub(super) async fn delete_properties(
    pool: &PgPool,
    entity_id: Uuid,
    entity_type: &str,
) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM uc_properties WHERE entity_id = $1 AND entity_type = $2")
        .bind(entity_id)
        .bind(entity_type)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
    Ok(())
}

pub(super) fn is_unique_violation(e: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db_err) = e {
        db_err.code().as_deref() == Some("23505")
    } else {
        false
    }
}
