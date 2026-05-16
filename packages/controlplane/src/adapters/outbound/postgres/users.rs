use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::user::User;

pub async fn upsert(
    db: &PgPool,
    id: Uuid,
    email: &str,
    username: &str,
    full_name: &str,
    roles: &[String],
    user_type: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, email, username, full_name, roles, user_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
            SET email     = EXCLUDED.email,
                username  = EXCLUDED.username,
                full_name = EXCLUDED.full_name,
                roles     = EXCLUDED.roles,
                user_type = EXCLUDED.user_type,
                updated_at = NOW()
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(email)
    .bind(username)
    .bind(full_name)
    .bind(roles)
    .bind(user_type)
    .fetch_one(db)
    .await
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}

pub async fn list(db: &PgPool) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY full_name ASC")
        .fetch_all(db)
        .await
}
