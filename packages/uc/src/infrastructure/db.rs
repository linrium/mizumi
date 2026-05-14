use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;

pub async fn create_pool(database_url: &str, max_connections: u32) -> anyhow::Result<Arc<PgPool>> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .connect(database_url)
        .await?;
    Ok(Arc::new(pool))
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
