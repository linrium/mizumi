use sqlx::PgPool;

use crate::domain::entities::user::User;

pub async fn upsert(
    db: &PgPool,
    id: &str,
    email: &str,
    username: &str,
    full_name: &str,
    roles: &[String],
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, email, username, full_name, roles)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
            SET email     = EXCLUDED.email,
                username  = EXCLUDED.username,
                full_name = EXCLUDED.full_name,
                roles     = EXCLUDED.roles,
                updated_at = NOW()
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(email)
    .bind(username)
    .bind(full_name)
    .bind(roles)
    .fetch_one(db)
    .await
}

pub async fn get(db: &PgPool, id: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}
