use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::streaming::StreamingJob;

pub fn is_unique_violation(e: &sqlx::Error) -> bool {
    matches!(
        e,
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505")
    )
}

pub async fn list(db: &PgPool) -> Result<Vec<StreamingJob>, sqlx::Error> {
    sqlx::query_as::<_, StreamingJob>("SELECT * FROM streaming_jobs ORDER BY created_at DESC")
        .fetch_all(db)
        .await
}

#[allow(clippy::too_many_arguments)]
pub async fn create(
    db: &PgPool,
    name: &str,
    namespace: &str,
    image: &str,
    main_application_file: &str,
    spark_version: &str,
    spark_conf: &serde_json::Value,
    driver_cores: i32,
    driver_memory: &str,
    executor_instances: i32,
    executor_cores: i32,
    executor_memory: &str,
) -> Result<StreamingJob, sqlx::Error> {
    sqlx::query_as::<_, StreamingJob>(
        r#"
        INSERT INTO streaming_jobs (
            name, namespace, image, main_application_file, spark_version,
            spark_conf, driver_cores, driver_memory, executor_instances,
            executor_cores, executor_memory
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        "#,
    )
    .bind(name)
    .bind(namespace)
    .bind(image)
    .bind(main_application_file)
    .bind(spark_version)
    .bind(spark_conf)
    .bind(driver_cores)
    .bind(driver_memory)
    .bind(executor_instances)
    .bind(executor_cores)
    .bind(executor_memory)
    .fetch_one(db)
    .await
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<StreamingJob>, sqlx::Error> {
    sqlx::query_as::<_, StreamingJob>("SELECT * FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}

pub async fn delete(db: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}
