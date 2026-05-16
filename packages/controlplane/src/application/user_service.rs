use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::users,
    domain::{entities::user::User, error::AppError},
    infrastructure::auth::KeycloakClaims,
};

#[derive(Clone)]
pub struct UserService {
    db: PgPool,
}

impl UserService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn ensure_registered(&self, claims: &KeycloakClaims) -> Result<User, AppError> {
        let id = Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::QueryFailed(format!("invalid sub UUID: {}", claims.sub)))?;
        let email = claims.email.as_deref().unwrap_or("");
        let username = claims.preferred_username.as_deref().unwrap_or("");
        let full_name = claims.name.as_deref().unwrap_or("");
        let roles: Vec<String> = claims.roles().iter().map(|s| s.to_string()).collect();

        users::upsert(&self.db, id, email, username, full_name, &roles, "USER")
            .await
            .map_err(AppError::Sqlx)
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<User, AppError> {
        users::get(&self.db, id)
            .await
            .map_err(AppError::Sqlx)?
            .ok_or(AppError::NotFound)
    }
}
