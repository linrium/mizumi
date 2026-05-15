use super::catalog::cascade_delete_schema;
use super::{
    decode_page_token, delete_properties, encode_page_token, fetch_properties, is_unique_violation,
    upsert_properties,
};
use crate::domain::{entities::schema::*, error::DomainError, ports::outbound::SchemaRepository};
use async_trait::async_trait;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgSchemaRepository {
    pool: Arc<PgPool>,
}

impl PgSchemaRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct SchemaRow {
    id: Uuid,
    name: String,
    catalog_name: String,
    comment: Option<String>,
    owner: Option<String>,
    created_at: chrono::NaiveDateTime,
    created_by: Option<String>,
    updated_at: Option<chrono::NaiveDateTime>,
    updated_by: Option<String>,
    storage_root: Option<String>,
    storage_location: Option<String>,
}

impl SchemaRow {
    fn into_info(self, properties: Option<HashMap<String, String>>) -> SchemaInfo {
        let full_name = format!("{}.{}", self.catalog_name, self.name);
        SchemaInfo {
            schema_id: self.id,
            name: self.name,
            catalog_name: self.catalog_name,
            full_name,
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

const SCHEMA_SELECT: &str = "SELECT s.id, s.name, c.name as catalog_name, s.comment, s.owner,
            s.created_at, s.created_by, s.updated_at, s.updated_by,
            s.storage_root, s.storage_location
     FROM uc_schemas s
     JOIN uc_catalogs c ON s.catalog_id = c.id";

#[async_trait]
impl SchemaRepository for PgSchemaRepository {
    async fn create(&self, cmd: CreateSchema) -> Result<SchemaInfo, DomainError> {
        // Look up catalog
        let catalog_row =
            sqlx::query_as::<_, (Uuid,)>("SELECT id FROM uc_catalogs WHERE name = $1")
                .bind(&cmd.catalog_name)
                .fetch_one(self.pool.as_ref())
                .await
                .map_err(|e| match e {
                    sqlx::Error::RowNotFound => {
                        DomainError::NotFound(format!("Catalog not found: {}", cmd.catalog_name))
                    }
                    e => DomainError::Internal(e.to_string()),
                })?;

        let id = Uuid::new_v4();
        let now = chrono::Utc::now().naive_utc();
        let catalog_id = catalog_row.0;

        let row = sqlx::query_as::<_, SchemaRow>(&format!(
            "{} WHERE s.id = $1",
            "WITH ins AS (
                INSERT INTO uc_schemas (id, catalog_id, name, comment, owner, created_at, updated_at, storage_root)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
             )
             SELECT s.id, s.name, c.name as catalog_name, s.comment, s.owner,
                    s.created_at, s.created_by, s.updated_at, s.updated_by,
                    s.storage_root, s.storage_location
             FROM uc_schemas s
             JOIN uc_catalogs c ON s.catalog_id = c.id
             JOIN ins ON s.id = ins.id"
        ))
        .bind(id)
        .bind(catalog_id)
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
                DomainError::AlreadyExists(format!("Schema already exists: {}.{}", cmd.catalog_name, cmd.name))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;

        if let Some(props) = &cmd.properties {
            upsert_properties(self.pool.as_ref(), id, "SCHEMA", props).await?;
        }

        let properties = fetch_properties(self.pool.as_ref(), id, "SCHEMA").await?;
        Ok(row.into_info(properties))
    }

    async fn list(
        &self,
        catalog_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListSchemasResponse, DomainError> {
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor = decode_page_token(&token)?;
            sqlx::query_as::<_, SchemaRow>(&format!(
                "{} WHERE c.name = $1 AND s.name > $2 ORDER BY s.name ASC LIMIT $3",
                SCHEMA_SELECT
            ))
            .bind(catalog_name)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, SchemaRow>(&format!(
                "{} WHERE c.name = $1 ORDER BY s.name ASC LIMIT $2",
                SCHEMA_SELECT
            ))
            .bind(catalog_name)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<SchemaRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last().map(|r| encode_page_token(&r.name))
        } else {
            None
        };

        let mut schemas = Vec::with_capacity(rows.len());
        for row in rows {
            let props = fetch_properties(self.pool.as_ref(), row.id, "SCHEMA").await?;
            schemas.push(row.into_info(props));
        }

        Ok(ListSchemasResponse {
            schemas,
            next_page_token,
        })
    }

    async fn get(&self, full_name: &str) -> Result<SchemaInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(2, '.').collect();
        if parts.len() != 2 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name) = (parts[0], parts[1]);

        let row = sqlx::query_as::<_, SchemaRow>(&format!(
            "{} WHERE c.name = $1 AND s.name = $2",
            SCHEMA_SELECT
        ))
        .bind(catalog_name)
        .bind(schema_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Schema not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        let properties = fetch_properties(self.pool.as_ref(), row.id, "SCHEMA").await?;
        Ok(row.into_info(properties))
    }

    async fn update(&self, full_name: &str, cmd: UpdateSchema) -> Result<SchemaInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(2, '.').collect();
        if parts.len() != 2 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name) = (parts[0], parts[1]);
        let now = chrono::Utc::now().naive_utc();
        let new_name = cmd.new_name.as_deref().unwrap_or(schema_name);

        let row = sqlx::query_as::<_, SchemaRow>(&format!(
            "WITH upd AS (
                UPDATE uc_schemas s
                SET name = $1, comment = COALESCE($2, s.comment), updated_at = $3
                FROM uc_catalogs c
                WHERE s.catalog_id = c.id AND c.name = $4 AND s.name = $5
                RETURNING s.id
             )
             {} JOIN upd ON s.id = upd.id",
            SCHEMA_SELECT
        ))
        .bind(new_name)
        .bind(&cmd.comment)
        .bind(now)
        .bind(catalog_name)
        .bind(schema_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Schema not found: {}", full_name))
            }
            e if is_unique_violation(&e) => DomainError::AlreadyExists(format!(
                "Schema already exists: {}.{}",
                catalog_name, new_name
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        if let Some(props) = &cmd.properties {
            upsert_properties(self.pool.as_ref(), row.id, "SCHEMA", props).await?;
        }

        let properties = fetch_properties(self.pool.as_ref(), row.id, "SCHEMA").await?;
        Ok(row.into_info(properties))
    }

    async fn delete(&self, full_name: &str, force: bool) -> Result<(), DomainError> {
        let parts: Vec<&str> = full_name.splitn(2, '.').collect();
        if parts.len() != 2 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name) = (parts[0], parts[1]);

        let row = sqlx::query_as::<_, (Uuid,)>(
            "SELECT s.id FROM uc_schemas s
             JOIN uc_catalogs c ON s.catalog_id = c.id
             WHERE c.name = $1 AND s.name = $2",
        )
        .bind(catalog_name)
        .bind(schema_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Schema not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        let schema_id = row.0;

        if force {
            cascade_delete_schema(self.pool.as_ref(), schema_id).await?;
        } else {
            delete_properties(self.pool.as_ref(), schema_id, "SCHEMA").await?;
            let result = sqlx::query("DELETE FROM uc_schemas WHERE id = $1")
                .bind(schema_id)
                .execute(self.pool.as_ref())
                .await
                .map_err(|e| DomainError::Internal(e.to_string()))?;
            if result.rows_affected() == 0 {
                return Err(DomainError::NotFound(format!(
                    "Schema not found: {}",
                    full_name
                )));
            }
        }

        Ok(())
    }
}
