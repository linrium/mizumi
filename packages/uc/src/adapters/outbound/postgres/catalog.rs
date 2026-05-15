use super::{
    decode_page_token, delete_properties, encode_page_token, fetch_properties, is_unique_violation,
    upsert_properties,
};
use crate::domain::{entities::catalog::*, error::DomainError, ports::outbound::CatalogRepository};
use async_trait::async_trait;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgCatalogRepository {
    pool: Arc<PgPool>,
}

impl PgCatalogRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct CatalogRow {
    id: Uuid,
    name: String,
    comment: Option<String>,
    owner: Option<String>,
    created_at: chrono::NaiveDateTime,
    created_by: Option<String>,
    updated_at: Option<chrono::NaiveDateTime>,
    updated_by: Option<String>,
    storage_root: Option<String>,
    storage_location: Option<String>,
}

impl CatalogRow {
    fn into_info(self, properties: Option<HashMap<String, String>>) -> CatalogInfo {
        CatalogInfo {
            id: self.id,
            name: self.name,
            comment: self.comment,
            properties,
            owner: self.owner,
            created_at: self.created_at.and_utc().timestamp_millis(),
            created_by: self.created_by,
            updated_at: self.updated_at.map(|t| t.and_utc().timestamp_millis()),
            updated_by: self.updated_by,
            storage_root: self.storage_root,
            storage_location: self.storage_location,
        }
    }
}

#[async_trait]
impl CatalogRepository for PgCatalogRepository {
    async fn create(&self, cmd: CreateCatalog) -> Result<CatalogInfo, DomainError> {
        let id = Uuid::new_v4();
        let now = chrono::Utc::now().naive_utc();

        let row = sqlx::query_as::<_, CatalogRow>(
            "INSERT INTO uc_catalogs (id, name, comment, owner, created_at, updated_at, storage_root)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, comment, owner, created_at, created_by, updated_at, updated_by, storage_root, storage_location",
        )
        .bind(id)
        .bind(&cmd.name)
        .bind(&cmd.comment)
        .bind(None::<String>)
        .bind(now)
        .bind(now)
        .bind(&cmd.storage_root)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| {
            if is_unique_violation(&e) {
                DomainError::AlreadyExists(format!("Catalog already exists: {}", cmd.name))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;

        if let Some(props) = &cmd.properties {
            upsert_properties(self.pool.as_ref(), id, "CATALOG", props).await?;
        }

        let properties = fetch_properties(self.pool.as_ref(), id, "CATALOG").await?;
        Ok(row.into_info(properties))
    }

    async fn list(
        &self,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListCatalogsResponse, DomainError> {
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor = decode_page_token(&token)?;
            sqlx::query_as::<_, CatalogRow>(
                "SELECT id, name, comment, owner, created_at, created_by, updated_at, updated_by, storage_root, storage_location
                 FROM uc_catalogs WHERE name > $1 ORDER BY name ASC LIMIT $2",
            )
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, CatalogRow>(
                "SELECT id, name, comment, owner, created_at, created_by, updated_at, updated_by, storage_root, storage_location
                 FROM uc_catalogs ORDER BY name ASC LIMIT $1",
            )
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<CatalogRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last().map(|r| encode_page_token(&r.name))
        } else {
            None
        };

        let mut catalogs = Vec::with_capacity(rows.len());
        for row in rows {
            let props = fetch_properties(self.pool.as_ref(), row.id, "CATALOG").await?;
            catalogs.push(row.into_info(props));
        }

        Ok(ListCatalogsResponse {
            catalogs,
            next_page_token,
        })
    }

    async fn get(&self, name: &str) -> Result<CatalogInfo, DomainError> {
        let row = sqlx::query_as::<_, CatalogRow>(
            "SELECT id, name, comment, owner, created_at, created_by, updated_at, updated_by, storage_root, storage_location
             FROM uc_catalogs WHERE name = $1",
        )
        .bind(name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!("Catalog not found: {}", name)),
            e => DomainError::Internal(e.to_string()),
        })?;

        let properties = fetch_properties(self.pool.as_ref(), row.id, "CATALOG").await?;
        Ok(row.into_info(properties))
    }

    async fn update(&self, name: &str, cmd: UpdateCatalog) -> Result<CatalogInfo, DomainError> {
        let now = chrono::Utc::now().naive_utc();
        let new_name = cmd.new_name.as_deref().unwrap_or(name);

        let row = sqlx::query_as::<_, CatalogRow>(
            "UPDATE uc_catalogs
             SET name = $1, comment = COALESCE($2, comment), updated_at = $3
             WHERE name = $4
             RETURNING id, name, comment, owner, created_at, created_by, updated_at, updated_by, storage_root, storage_location",
        )
        .bind(new_name)
        .bind(&cmd.comment)
        .bind(now)
        .bind(name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!("Catalog not found: {}", name)),
            e if is_unique_violation(&e) => DomainError::AlreadyExists(format!("Catalog already exists: {}", new_name)),
            e => DomainError::Internal(e.to_string()),
        })?;

        if let Some(props) = &cmd.properties {
            upsert_properties(self.pool.as_ref(), row.id, "CATALOG", props).await?;
        }

        let properties = fetch_properties(self.pool.as_ref(), row.id, "CATALOG").await?;
        Ok(row.into_info(properties))
    }

    async fn delete(&self, name: &str, force: bool) -> Result<(), DomainError> {
        let row = sqlx::query_as::<_, CatalogRow>(
            "SELECT id, name, comment, owner, created_at, created_by, updated_at, updated_by, storage_root, storage_location
             FROM uc_catalogs WHERE name = $1",
        )
        .bind(name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!("Catalog not found: {}", name)),
            e => DomainError::Internal(e.to_string()),
        })?;

        if force {
            cascade_delete_catalog(self.pool.as_ref(), row.id).await?;
        }

        delete_properties(self.pool.as_ref(), row.id, "CATALOG").await?;

        let result = sqlx::query("DELETE FROM uc_catalogs WHERE id = $1")
            .bind(row.id)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound(format!(
                "Catalog not found: {}",
                name
            )));
        }

        Ok(())
    }
}

async fn cascade_delete_catalog(pool: &PgPool, catalog_id: Uuid) -> Result<(), DomainError> {
    #[derive(sqlx::FromRow)]
    struct IdRow {
        id: Uuid,
    }

    let schema_rows = sqlx::query_as::<_, IdRow>("SELECT id FROM uc_schemas WHERE catalog_id = $1")
        .bind(catalog_id)
        .fetch_all(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

    for schema_row in schema_rows {
        cascade_delete_schema(pool, schema_row.id).await?;
    }

    Ok(())
}

pub(super) async fn cascade_delete_schema(
    pool: &PgPool,
    schema_id: Uuid,
) -> Result<(), DomainError> {
    #[derive(sqlx::FromRow)]
    struct IdRow {
        id: Uuid,
    }

    // Delete model versions first, then registered models
    let model_rows =
        sqlx::query_as::<_, IdRow>("SELECT id FROM uc_registered_models WHERE schema_id = $1")
            .bind(schema_id)
            .fetch_all(pool)
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

    for model_row in model_rows {
        sqlx::query("DELETE FROM uc_model_versions WHERE registered_model_id = $1")
            .bind(model_row.id)
            .execute(pool)
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;
        delete_properties(pool, model_row.id, "REGISTERED_MODEL").await?;
    }

    sqlx::query("DELETE FROM uc_registered_models WHERE schema_id = $1")
        .bind(schema_id)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

    // Delete functions
    let fn_rows = sqlx::query_as::<_, IdRow>("SELECT id FROM uc_functions WHERE schema_id = $1")
        .bind(schema_id)
        .fetch_all(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
    for fn_row in fn_rows {
        delete_properties(pool, fn_row.id, "FUNCTION").await?;
    }
    sqlx::query("DELETE FROM uc_functions WHERE schema_id = $1")
        .bind(schema_id)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

    // Delete volumes
    let vol_rows = sqlx::query_as::<_, IdRow>("SELECT id FROM uc_volumes WHERE schema_id = $1")
        .bind(schema_id)
        .fetch_all(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
    for vol_row in vol_rows {
        delete_properties(pool, vol_row.id, "VOLUME").await?;
    }
    sqlx::query("DELETE FROM uc_volumes WHERE schema_id = $1")
        .bind(schema_id)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

    // Delete tables (uc_columns cascade-deletes automatically)
    let tbl_rows = sqlx::query_as::<_, IdRow>("SELECT id FROM uc_tables WHERE schema_id = $1")
        .bind(schema_id)
        .fetch_all(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
    for tbl_row in tbl_rows {
        delete_properties(pool, tbl_row.id, "TABLE").await?;
    }
    sqlx::query("DELETE FROM uc_tables WHERE schema_id = $1")
        .bind(schema_id)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

    delete_properties(pool, schema_id, "SCHEMA").await?;
    sqlx::query("DELETE FROM uc_schemas WHERE id = $1")
        .bind(schema_id)
        .execute(pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

    Ok(())
}
