use std::sync::Arc;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;
use crate::domain::{
    entities::user::{CreateUser, UpdateUser, User, UserState},
    error::DomainError,
    ports::outbound::UserRepository,
};

pub struct PgUserRepository {
    pool: Arc<PgPool>,
}

impl PgUserRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    name: String,
    email: String,
    external_id: Option<String>,
    state: String,
    picture_url: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: Option<DateTime<Utc>>,
}

impl UserRow {
    fn into_user(self) -> User {
        User {
            id: self.id,
            name: self.name,
            email: self.email,
            external_id: self.external_id,
            state: self.state.parse().unwrap_or(UserState::Enabled),
            picture_url: self.picture_url,
            created_at: self.created_at.timestamp_millis(),
            updated_at: self.updated_at.map(|t| t.timestamp_millis()),
        }
    }
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn create(&self, cmd: CreateUser) -> Result<User, DomainError> {
        let id = Uuid::new_v4();
        let now = chrono::Utc::now().naive_utc();
        let row = sqlx::query_as::<_, UserRow>(
            r#"INSERT INTO uc_users (id, name, email, external_id, state, picture_url, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, name, email, external_id, state, picture_url, created_at, updated_at"#,
        )
        .bind(id)
        .bind(&cmd.name)
        .bind(&cmd.email)
        .bind(&cmd.external_id)
        .bind(if cmd.active { "ENABLED" } else { "DISABLED" })
        .bind(&cmd.picture_url)
        .bind(now)
        .fetch_one(&*self.pool)
        .await
        .map_err(|e| {
            if super::is_unique_violation(&e) {
                DomainError::AlreadyExists(format!("User already exists: {}", cmd.email))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;
        Ok(row.into_user())
    }

    async fn list(&self, start_index: usize, count: usize) -> Result<Vec<User>, DomainError> {
        let rows = sqlx::query_as::<_, UserRow>(
            "SELECT id, name, email, external_id, state, picture_url, created_at, updated_at
             FROM uc_users ORDER BY created_at ASC LIMIT $1 OFFSET $2",
        )
        .bind(count as i64)
        .bind(start_index as i64)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
        Ok(rows.into_iter().map(UserRow::into_user).collect())
    }

    async fn get(&self, id: &str) -> Result<User, DomainError> {
        // Accept both UUID lookup and email lookup (SCIM clients sometimes use email as id)
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, name, email, external_id, state, picture_url, created_at, updated_at
             FROM uc_users WHERE id::text = $1 OR email = $1",
        )
        .bind(id)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?
        .ok_or_else(|| DomainError::NotFound(format!("User not found: {}", id)))?;
        Ok(row.into_user())
    }

    async fn update(&self, id: &str, cmd: UpdateUser) -> Result<User, DomainError> {
        let current = self.get(id).await?;
        let new_name = cmd.name.unwrap_or(current.name);
        let new_state = match cmd.active {
            Some(true) => "ENABLED",
            Some(false) => "DISABLED",
            None => current.state.as_str(),
        };
        let new_external_id = cmd.external_id.or(current.external_id);

        let row = sqlx::query_as::<_, UserRow>(
            r#"UPDATE uc_users SET name = $1, state = $2, external_id = $3, updated_at = NOW()
               WHERE id::text = $4 OR email = $4
               RETURNING id, name, email, external_id, state, picture_url, created_at, updated_at"#,
        )
        .bind(&new_name)
        .bind(new_state)
        .bind(&new_external_id)
        .bind(id)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?
        .ok_or_else(|| DomainError::NotFound(format!("User not found: {}", id)))?;
        Ok(row.into_user())
    }

    async fn delete(&self, id: &str) -> Result<(), DomainError> {
        let result = sqlx::query("DELETE FROM uc_users WHERE id::text = $1 OR email = $1")
            .bind(id)
            .execute(&*self.pool)
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound(format!("User not found: {}", id)));
        }
        Ok(())
    }
}
