use super::{decode_page_token, encode_page_token, is_unique_violation};
use crate::domain::{
    entities::model::*,
    error::DomainError,
    ports::outbound::{ModelVersionRepository, RegisteredModelRepository},
};
use async_trait::async_trait;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgRegisteredModelRepository {
    pool: Arc<PgPool>,
}

impl PgRegisteredModelRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

pub struct PgModelVersionRepository {
    pool: Arc<PgPool>,
}

impl PgModelVersionRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct RegisteredModelRow {
    id: Uuid,
    name: String,
    schema_name: String,
    catalog_name: String,
    comment: Option<String>,
    owner: Option<String>,
    created_at: chrono::NaiveDateTime,
    created_by: Option<String>,
    updated_at: Option<chrono::NaiveDateTime>,
    updated_by: Option<String>,
    storage_location: Option<String>,
}

const MODEL_SELECT: &str = "SELECT rm.id, rm.name, s.name as schema_name, c.name as catalog_name,
            rm.comment, rm.owner, rm.created_at, rm.created_by, rm.updated_at, rm.updated_by,
            rm.storage_location
     FROM uc_registered_models rm
     JOIN uc_schemas s ON rm.schema_id = s.id
     JOIN uc_catalogs c ON s.catalog_id = c.id";

fn row_to_model_info(row: RegisteredModelRow) -> RegisteredModelInfo {
    let full_name = format!("{}.{}.{}", row.catalog_name, row.schema_name, row.name);
    RegisteredModelInfo {
        id: row.id,
        name: row.name,
        catalog_name: row.catalog_name,
        schema_name: row.schema_name,
        full_name,
        comment: row.comment,
        owner: row.owner,
        storage_location: row.storage_location,
        created_at: row.created_at.and_utc().timestamp_millis(),
        created_by: row.created_by,
        updated_at: row.updated_at.map(|t| t.and_utc().timestamp_millis()),
        updated_by: row.updated_by,
    }
}

#[async_trait]
impl RegisteredModelRepository for PgRegisteredModelRepository {
    async fn create(&self, cmd: CreateRegisteredModel) -> Result<RegisteredModelInfo, DomainError> {
        let schema_row = sqlx::query_as::<_, (Uuid,)>(
            "SELECT s.id FROM uc_schemas s JOIN uc_catalogs c ON s.catalog_id = c.id
             WHERE c.name = $1 AND s.name = $2",
        )
        .bind(&cmd.catalog_name)
        .bind(&cmd.schema_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!(
                "Schema not found: {}.{}",
                cmd.catalog_name, cmd.schema_name
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        let id = Uuid::new_v4();
        let now = chrono::Utc::now().naive_utc();
        let schema_id = schema_row.0;

        sqlx::query(
            "INSERT INTO uc_registered_models (id, schema_id, name, comment, owner, created_at, updated_at, storage_location)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(id)
        .bind(schema_id)
        .bind(&cmd.name)
        .bind(&cmd.comment)
        .bind(None::<String>)
        .bind(now)
        .bind(now)
        .bind(&cmd.storage_location)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| {
            if is_unique_violation(&e) {
                DomainError::AlreadyExists(format!(
                    "Registered model already exists: {}.{}.{}",
                    cmd.catalog_name, cmd.schema_name, cmd.name
                ))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;

        let row =
            sqlx::query_as::<_, RegisteredModelRow>(&format!("{} WHERE rm.id = $1", MODEL_SELECT))
                .bind(id)
                .fetch_one(self.pool.as_ref())
                .await
                .map_err(|e| DomainError::Internal(e.to_string()))?;

        Ok(row_to_model_info(row))
    }

    async fn list(
        &self,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListRegisteredModelsResponse, DomainError> {
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor = decode_page_token(&token)?;
            sqlx::query_as::<_, RegisteredModelRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 AND rm.name > $3 ORDER BY rm.name ASC LIMIT $4",
                MODEL_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, RegisteredModelRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 ORDER BY rm.name ASC LIMIT $3",
                MODEL_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<RegisteredModelRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last().map(|r| encode_page_token(&r.name))
        } else {
            None
        };

        let registered_models = rows.into_iter().map(row_to_model_info).collect();
        Ok(ListRegisteredModelsResponse {
            registered_models,
            next_page_token,
        })
    }

    async fn get(&self, full_name: &str) -> Result<RegisteredModelInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.model, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, model_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, RegisteredModelRow>(&format!(
            "{} WHERE c.name = $1 AND s.name = $2 AND rm.name = $3",
            MODEL_SELECT
        ))
        .bind(catalog_name)
        .bind(schema_name)
        .bind(model_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Registered model not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        Ok(row_to_model_info(row))
    }

    async fn update(
        &self,
        full_name: &str,
        cmd: UpdateRegisteredModel,
    ) -> Result<RegisteredModelInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.model, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, model_name) = (parts[0], parts[1], parts[2]);
        let now = chrono::Utc::now().naive_utc();
        let new_name = cmd.new_name.as_deref().unwrap_or(model_name);

        let row = sqlx::query_as::<_, RegisteredModelRow>(&format!(
            "WITH upd AS (
                UPDATE uc_registered_models rm
                SET name = $1, comment = COALESCE($2, rm.comment), updated_at = $3
                FROM uc_schemas s JOIN uc_catalogs c ON s.catalog_id = c.id
                WHERE rm.schema_id = s.id AND c.name = $4 AND s.name = $5 AND rm.name = $6
                RETURNING rm.id
             )
             {} JOIN upd ON rm.id = upd.id",
            MODEL_SELECT
        ))
        .bind(new_name)
        .bind(&cmd.comment)
        .bind(now)
        .bind(catalog_name)
        .bind(schema_name)
        .bind(model_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Registered model not found: {}", full_name))
            }
            e if is_unique_violation(&e) => DomainError::AlreadyExists(format!(
                "Registered model already exists: {}.{}.{}",
                catalog_name, schema_name, new_name
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        Ok(row_to_model_info(row))
    }

    async fn delete(&self, full_name: &str) -> Result<(), DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.model, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, model_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, (Uuid,)>(
            "SELECT rm.id FROM uc_registered_models rm
             JOIN uc_schemas s ON rm.schema_id = s.id
             JOIN uc_catalogs c ON s.catalog_id = c.id
             WHERE c.name = $1 AND s.name = $2 AND rm.name = $3",
        )
        .bind(catalog_name)
        .bind(schema_name)
        .bind(model_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Registered model not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        sqlx::query("DELETE FROM uc_model_versions WHERE registered_model_id = $1")
            .bind(row.0)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        sqlx::query("DELETE FROM uc_registered_models WHERE id = $1")
            .bind(row.0)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        Ok(())
    }
}

// ─── Model Version Repository ─────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ModelVersionRow {
    id: Uuid,
    model_name: String,
    schema_name: String,
    catalog_name: String,
    version: i64,
    status: String,
    source: Option<String>,
    run_id: Option<String>,
    comment: Option<String>,
    storage_location: Option<String>,
    created_at: chrono::NaiveDateTime,
    created_by: Option<String>,
    updated_at: Option<chrono::NaiveDateTime>,
    updated_by: Option<String>,
}

const VERSION_SELECT: &str =
    "SELECT mv.id, rm.name as model_name, s.name as schema_name, c.name as catalog_name,
            mv.version, mv.status, mv.source, mv.run_id, mv.comment, mv.storage_location,
            mv.created_at, mv.created_by, mv.updated_at, mv.updated_by
     FROM uc_model_versions mv
     JOIN uc_registered_models rm ON mv.registered_model_id = rm.id
     JOIN uc_schemas s ON rm.schema_id = s.id
     JOIN uc_catalogs c ON s.catalog_id = c.id";

fn row_to_version_info(row: ModelVersionRow) -> Result<ModelVersionInfo, DomainError> {
    let status = ModelVersionStatus::from_str(&row.status).ok_or_else(|| {
        DomainError::Internal(format!("Unknown model version status: {}", row.status))
    })?;
    Ok(ModelVersionInfo {
        id: row.id,
        model_name: row.model_name,
        catalog_name: row.catalog_name,
        schema_name: row.schema_name,
        version: row.version,
        status,
        source: row.source,
        run_id: row.run_id,
        comment: row.comment,
        storage_location: row.storage_location,
        created_at: row.created_at.and_utc().timestamp_millis(),
        created_by: row.created_by,
        updated_at: row.updated_at.map(|t| t.and_utc().timestamp_millis()),
        updated_by: row.updated_by,
    })
}

fn parse_model_full_name(full_name: &str) -> Result<(&str, &str, &str), DomainError> {
    let parts: Vec<&str> = full_name.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(DomainError::InvalidArgument(format!(
            "Expected full_name as catalog.schema.model, got: {}",
            full_name
        )));
    }
    Ok((parts[0], parts[1], parts[2]))
}

#[async_trait]
impl ModelVersionRepository for PgModelVersionRepository {
    async fn create(&self, cmd: CreateModelVersion) -> Result<ModelVersionInfo, DomainError> {
        // Increment max_version_number and get new version
        let version_row = sqlx::query_as::<_, (i64, Uuid)>(
            "UPDATE uc_registered_models rm
             SET max_version_number = max_version_number + 1, updated_at = $1
             FROM uc_schemas s JOIN uc_catalogs c ON s.catalog_id = c.id
             WHERE rm.schema_id = s.id AND c.name = $2 AND s.name = $3 AND rm.name = $4
             RETURNING rm.max_version_number, rm.id",
        )
        .bind(chrono::Utc::now().naive_utc())
        .bind(&cmd.catalog_name)
        .bind(&cmd.schema_name)
        .bind(&cmd.model_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!(
                "Registered model not found: {}.{}.{}",
                cmd.catalog_name, cmd.schema_name, cmd.model_name
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        let (version, registered_model_id) = version_row;
        let id = Uuid::new_v4();
        let now = chrono::Utc::now().naive_utc();

        sqlx::query(
            "INSERT INTO uc_model_versions (id, registered_model_id, version, status, source, run_id,
             comment, owner, created_at, updated_at, storage_location)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(id)
        .bind(registered_model_id)
        .bind(version)
        .bind(ModelVersionStatus::PENDING_REGISTRATION.as_str())
        .bind(&cmd.source)
        .bind(&cmd.run_id)
        .bind(&cmd.comment)
        .bind(None::<String>)
        .bind(now)
        .bind(now)
        .bind(&cmd.storage_location)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        let row =
            sqlx::query_as::<_, ModelVersionRow>(&format!("{} WHERE mv.id = $1", VERSION_SELECT))
                .bind(id)
                .fetch_one(self.pool.as_ref())
                .await
                .map_err(|e| DomainError::Internal(e.to_string()))?;

        row_to_version_info(row)
    }

    async fn list(
        &self,
        model_full_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListModelVersionsResponse, DomainError> {
        let (catalog_name, schema_name, model_name) = parse_model_full_name(model_full_name)?;
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor: i64 = decode_page_token(&token).and_then(|s| {
                s.parse::<i64>()
                    .map_err(|e| DomainError::InvalidArgument(format!("Invalid page token: {}", e)))
            })?;
            sqlx::query_as::<_, ModelVersionRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 AND rm.name = $3 AND mv.version > $4
                 ORDER BY mv.version ASC LIMIT $5",
                VERSION_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(model_name)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, ModelVersionRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 AND rm.name = $3
                 ORDER BY mv.version ASC LIMIT $4",
                VERSION_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(model_name)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<ModelVersionRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last()
                .map(|r| encode_page_token(&r.version.to_string()))
        } else {
            None
        };

        let mut model_versions = Vec::with_capacity(rows.len());
        for row in rows {
            model_versions.push(row_to_version_info(row)?);
        }

        Ok(ListModelVersionsResponse {
            model_versions,
            next_page_token,
        })
    }

    async fn get(
        &self,
        model_full_name: &str,
        version: i64,
    ) -> Result<ModelVersionInfo, DomainError> {
        let (catalog_name, schema_name, model_name) = parse_model_full_name(model_full_name)?;

        let row = sqlx::query_as::<_, ModelVersionRow>(&format!(
            "{} WHERE c.name = $1 AND s.name = $2 AND rm.name = $3 AND mv.version = $4",
            VERSION_SELECT
        ))
        .bind(catalog_name)
        .bind(schema_name)
        .bind(model_name)
        .bind(version)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!(
                "Model version not found: {}/{}",
                model_full_name, version
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        row_to_version_info(row)
    }

    async fn update(
        &self,
        model_full_name: &str,
        version: i64,
        cmd: UpdateModelVersion,
    ) -> Result<ModelVersionInfo, DomainError> {
        let (catalog_name, schema_name, model_name) = parse_model_full_name(model_full_name)?;
        let now = chrono::Utc::now().naive_utc();

        let row = sqlx::query_as::<_, ModelVersionRow>(&format!(
            "WITH upd AS (
                UPDATE uc_model_versions mv
                SET comment = COALESCE($1, mv.comment), updated_at = $2
                FROM uc_registered_models rm
                JOIN uc_schemas s ON rm.schema_id = s.id
                JOIN uc_catalogs c ON s.catalog_id = c.id
                WHERE mv.registered_model_id = rm.id
                  AND c.name = $3 AND s.name = $4 AND rm.name = $5 AND mv.version = $6
                RETURNING mv.id
             )
             {} JOIN upd ON mv.id = upd.id",
            VERSION_SELECT
        ))
        .bind(&cmd.comment)
        .bind(now)
        .bind(catalog_name)
        .bind(schema_name)
        .bind(model_name)
        .bind(version)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => DomainError::NotFound(format!(
                "Model version not found: {}/{}",
                model_full_name, version
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        row_to_version_info(row)
    }

    async fn delete(&self, model_full_name: &str, version: i64) -> Result<(), DomainError> {
        let (catalog_name, schema_name, model_name) = parse_model_full_name(model_full_name)?;

        let result = sqlx::query(
            "DELETE FROM uc_model_versions mv
             USING uc_registered_models rm, uc_schemas s, uc_catalogs c
             WHERE mv.registered_model_id = rm.id AND rm.schema_id = s.id AND s.catalog_id = c.id
               AND c.name = $1 AND s.name = $2 AND rm.name = $3 AND mv.version = $4",
        )
        .bind(catalog_name)
        .bind(schema_name)
        .bind(model_name)
        .bind(version)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound(format!(
                "Model version not found: {}/{}",
                model_full_name, version
            )));
        }

        Ok(())
    }
}
