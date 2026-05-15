use crate::domain::{
    entities::metastore::MetastoreInfo, error::DomainError, ports::outbound::MetastoreRepository,
};
use async_trait::async_trait;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgMetastoreRepository {
    pool: Arc<PgPool>,
}

impl PgMetastoreRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct MetastoreRow {
    id: Uuid,
}

impl From<MetastoreRow> for MetastoreInfo {
    fn from(row: MetastoreRow) -> Self {
        MetastoreInfo {
            metastore_id: row.id,
        }
    }
}

#[async_trait]
impl MetastoreRepository for PgMetastoreRepository {
    async fn initialize(&self) -> Result<MetastoreInfo, DomainError> {
        let existing = sqlx::query_as::<_, MetastoreRow>("SELECT id FROM uc_metastore LIMIT 1")
            .fetch_optional(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        if let Some(row) = existing {
            return Ok(row.into());
        }

        let id = Uuid::new_v4();
        let row = sqlx::query_as::<_, MetastoreRow>(
            "INSERT INTO uc_metastore (id) VALUES ($1) RETURNING id",
        )
        .bind(id)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        tracing::info!("Initialized metastore with id: {}", id);
        Ok(row.into())
    }

    async fn get(&self) -> Result<MetastoreInfo, DomainError> {
        sqlx::query_as::<_, MetastoreRow>("SELECT id FROM uc_metastore LIMIT 1")
            .fetch_one(self.pool.as_ref())
            .await
            .map(Into::into)
            .map_err(|e| match e {
                sqlx::Error::RowNotFound => {
                    DomainError::NotFound("Metastore not initialized".to_string())
                }
                e => DomainError::Internal(e.to_string()),
            })
    }
}
