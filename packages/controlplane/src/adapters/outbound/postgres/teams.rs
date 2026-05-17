use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::team::{Team, TeamMember};

pub async fn list(db: &PgPool) -> Result<Vec<Team>, sqlx::Error> {
    sqlx::query_as::<_, Team>("SELECT * FROM teams ORDER BY name ASC")
        .fetch_all(db)
        .await
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<Team>, sqlx::Error> {
    sqlx::query_as::<_, Team>("SELECT * FROM teams WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}

pub async fn create(db: &PgPool, name: &str) -> Result<Team, sqlx::Error> {
    sqlx::query_as::<_, Team>("INSERT INTO teams (name) VALUES ($1) RETURNING *")
        .bind(name)
        .fetch_one(db)
        .await
}

pub async fn list_members(db: &PgPool, team_id: Uuid) -> Result<Vec<TeamMember>, sqlx::Error> {
    sqlx::query_as::<_, TeamMember>(
        r#"
        SELECT tm.team_id, tm.user_id, u.full_name, u.email, u.username, tm.created_at AS joined_at
        FROM team_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = $1
        ORDER BY u.full_name ASC
        "#,
    )
    .bind(team_id)
    .fetch_all(db)
    .await
}

pub async fn list_for_user(db: &PgPool, user_id: Uuid) -> Result<Vec<Team>, sqlx::Error> {
    sqlx::query_as::<_, Team>(
        r#"
        SELECT t.*
        FROM teams t
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = $1
        ORDER BY t.name ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn is_member(db: &PgPool, team_id: Uuid, user_id: Uuid) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"
            SELECT EXISTS(
                SELECT 1
                FROM team_members
                WHERE team_id = $1 AND user_id = $2
            )
            "#,
    )
    .bind(team_id)
    .bind(user_id)
    .fetch_one(db)
    .await?)
}

pub async fn add_member(
    db: &PgPool,
    team_id: Uuid,
    user_id: Uuid,
) -> Result<TeamMember, sqlx::Error> {
    sqlx::query_as::<_, TeamMember>(
        r#"
        INSERT INTO team_members (team_id, user_id)
        VALUES ($1, $2)
        RETURNING
            team_id,
            user_id,
            (SELECT full_name FROM users WHERE id = $2) AS full_name,
            (SELECT email     FROM users WHERE id = $2) AS email,
            (SELECT username  FROM users WHERE id = $2) AS username,
            created_at AS joined_at
        "#,
    )
    .bind(team_id)
    .bind(user_id)
    .fetch_one(db)
    .await
}

pub async fn remove_member(db: &PgPool, team_id: Uuid, user_id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2")
        .bind(team_id)
        .bind(user_id)
        .execute(db)
        .await?;
    Ok(result.rows_affected() > 0)
}
