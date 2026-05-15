use super::{decode_page_token, encode_page_token, is_unique_violation};
use crate::domain::{entities::volume::*, error::DomainError, ports::outbound::VolumeRepository};
use async_trait::async_trait;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgVolumeRepository {
    pool: Arc<PgPool>,
}

impl PgVolumeRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct VolumeRow {
    id: Uuid,
    name: String,
    schema_name: String,
    catalog_name: String,
    volume_type: String,
    storage_location: Option<String>,
    comment: Option<String>,
    owner: Option<String>,
    created_at: chrono::NaiveDateTime,
    created_by: Option<String>,
    updated_at: Option<chrono::NaiveDateTime>,
    updated_by: Option<String>,
}

const VOLUME_SELECT: &str = "SELECT v.id, v.name, s.name as schema_name, c.name as catalog_name,
            v.volume_type, v.storage_location, v.comment, v.owner,
            v.created_at, v.created_by, v.updated_at, v.updated_by
     FROM uc_volumes v
     JOIN uc_schemas s ON v.schema_id = s.id
     JOIN uc_catalogs c ON s.catalog_id = c.id";

fn row_to_volume_info(row: VolumeRow) -> Result<VolumeInfo, DomainError> {
    let volume_type = VolumeType::from_str(&row.volume_type).ok_or_else(|| {
        DomainError::Internal(format!("Unknown volume type: {}", row.volume_type))
    })?;
    let full_name = format!("{}.{}.{}", row.catalog_name, row.schema_name, row.name);
    Ok(VolumeInfo {
        volume_id: row.id,
        name: row.name,
        catalog_name: row.catalog_name,
        schema_name: row.schema_name,
        full_name,
        volume_type,
        storage_location: row.storage_location,
        comment: row.comment,
        owner: row.owner,
        created_at: row.created_at.and_utc().timestamp_millis(),
        created_by: row.created_by,
        updated_at: row.updated_at.map(|t| t.and_utc().timestamp_millis()),
        updated_by: row.updated_by,
    })
}

#[async_trait]
impl VolumeRepository for PgVolumeRepository {
    async fn create(&self, cmd: CreateVolume) -> Result<VolumeInfo, DomainError> {
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
            "INSERT INTO uc_volumes (id, schema_id, name, volume_type, storage_location, comment, owner, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(id)
        .bind(schema_id)
        .bind(&cmd.name)
        .bind(cmd.volume_type.as_str())
        .bind(&cmd.storage_location)
        .bind(&cmd.comment)
        .bind(None::<String>)
        .bind(now)
        .bind(now)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| {
            if is_unique_violation(&e) {
                DomainError::AlreadyExists(format!(
                    "Volume already exists: {}.{}.{}",
                    cmd.catalog_name, cmd.schema_name, cmd.name
                ))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;

        let row = sqlx::query_as::<_, VolumeRow>(&format!("{} WHERE v.id = $1", VOLUME_SELECT))
            .bind(id)
            .fetch_one(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        row_to_volume_info(row)
    }

    async fn list(
        &self,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListVolumesResponse, DomainError> {
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor = decode_page_token(&token)?;
            sqlx::query_as::<_, VolumeRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 AND v.name > $3 ORDER BY v.name ASC LIMIT $4",
                VOLUME_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, VolumeRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 ORDER BY v.name ASC LIMIT $3",
                VOLUME_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<VolumeRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last().map(|r| encode_page_token(&r.name))
        } else {
            None
        };

        let mut volumes = Vec::with_capacity(rows.len());
        for row in rows {
            volumes.push(row_to_volume_info(row)?);
        }

        Ok(ListVolumesResponse {
            volumes,
            next_page_token,
        })
    }

    async fn get(&self, full_name: &str) -> Result<VolumeInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.volume, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, volume_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, VolumeRow>(&format!(
            "{} WHERE c.name = $1 AND s.name = $2 AND v.name = $3",
            VOLUME_SELECT
        ))
        .bind(catalog_name)
        .bind(schema_name)
        .bind(volume_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Volume not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        row_to_volume_info(row)
    }

    async fn update(&self, full_name: &str, cmd: UpdateVolume) -> Result<VolumeInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.volume, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, volume_name) = (parts[0], parts[1], parts[2]);
        let now = chrono::Utc::now().naive_utc();
        let new_name = cmd.new_name.as_deref().unwrap_or(volume_name);

        let row = sqlx::query_as::<_, VolumeRow>(&format!(
            "WITH upd AS (
                UPDATE uc_volumes v
                SET name = $1, comment = COALESCE($2, v.comment), updated_at = $3
                FROM uc_schemas s JOIN uc_catalogs c ON s.catalog_id = c.id
                WHERE v.schema_id = s.id AND c.name = $4 AND s.name = $5 AND v.name = $6
                RETURNING v.id
             )
             {} JOIN upd ON v.id = upd.id",
            VOLUME_SELECT
        ))
        .bind(new_name)
        .bind(&cmd.comment)
        .bind(now)
        .bind(catalog_name)
        .bind(schema_name)
        .bind(volume_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Volume not found: {}", full_name))
            }
            e if is_unique_violation(&e) => DomainError::AlreadyExists(format!(
                "Volume already exists: {}.{}.{}",
                catalog_name, schema_name, new_name
            )),
            e => DomainError::Internal(e.to_string()),
        })?;

        row_to_volume_info(row)
    }

    async fn delete(&self, full_name: &str) -> Result<(), DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.volume, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, volume_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, (Uuid,)>(
            "SELECT v.id FROM uc_volumes v
             JOIN uc_schemas s ON v.schema_id = s.id
             JOIN uc_catalogs c ON s.catalog_id = c.id
             WHERE c.name = $1 AND s.name = $2 AND v.name = $3",
        )
        .bind(catalog_name)
        .bind(schema_name)
        .bind(volume_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Volume not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        sqlx::query("DELETE FROM uc_volumes WHERE id = $1")
            .bind(row.0)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        Ok(())
    }
}
