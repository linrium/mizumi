use sqlx::PgPool;

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
        let email = claims.email.as_deref().unwrap_or("");
        let username = claims.preferred_username.as_deref().unwrap_or("");
        let full_name = claims.name.as_deref().unwrap_or("");
        let roles: Vec<String> = claims.roles().iter().map(|s| s.to_string()).collect();

        users::upsert(&self.db, &claims.sub, email, username, full_name, &roles)
            .await
            .map_err(AppError::Sqlx)
    }

    pub async fn get_by_id(&self, id: &str) -> Result<User, AppError> {
        users::get(&self.db, id)
            .await
            .map_err(AppError::Sqlx)?
            .ok_or(AppError::NotFound)
    }
}
