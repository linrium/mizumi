use super::{
    decode_page_token, delete_properties, encode_page_token, fetch_properties, is_unique_violation,
    upsert_properties,
};
use crate::domain::{entities::table::*, error::DomainError, ports::outbound::TableRepository};
use async_trait::async_trait;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgTableRepository {
    pool: Arc<PgPool>,
}

impl PgTableRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct TableRow {
    id: Uuid,
    name: String,
    schema_name: String,
    catalog_name: String,
    table_type: Option<String>,
    data_source_format: Option<String>,
    url: Option<String>,
    comment: Option<String>,
    owner: Option<String>,
    column_count: Option<i32>,
    created_at: Option<chrono::NaiveDateTime>,
    created_by: Option<String>,
    updated_at: Option<chrono::NaiveDateTime>,
    updated_by: Option<String>,
    view_definition: Option<String>,
    uniform_iceberg_converted_delta_timestamp: Option<chrono::NaiveDateTime>,
    uniform_iceberg_converted_delta_version: Option<i64>,
    uniform_iceberg_metadata_location: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ColumnRow {
    name: String,
    type_text: String,
    type_json: Option<String>,
    type_name: String,
    type_precision: Option<i32>,
    type_scale: Option<i32>,
    type_interval_type: Option<String>,
    ordinal_position: i16,
    comment: Option<String>,
    nullable: bool,
    partition_index: Option<i16>,}

const TABLE_SELECT: &str = "SELECT t.id, t.name, s.name as schema_name, c.name as catalog_name,
            t.\"type\" as table_type, t.data_source_format, t.url, t.comment, t.owner,
            t.column_count, t.created_at, t.created_by, t.updated_at, t.updated_by,
            CASE WHEN t.view_definition IS NOT NULL
                 THEN convert_from(lo_get(t.view_definition), 'UTF8') END as view_definition,
            t.uniform_iceberg_converted_delta_timestamp,
            t.uniform_iceberg_converted_delta_version,
            t.uniform_iceberg_metadata_location
     FROM uc_tables t
     JOIN uc_schemas s ON t.schema_id = s.id
     JOIN uc_catalogs c ON s.catalog_id = c.id";

fn parse_table_type(s: &str) -> Result<TableType, DomainError> {
    TableType::from_str(s)
        .ok_or_else(|| DomainError::Internal(format!("Unknown table type: {}", s)))
}

fn parse_data_source_format(s: &str) -> Result<DataSourceFormat, DomainError> {
    DataSourceFormat::from_str(s)
        .ok_or_else(|| DomainError::Internal(format!("Unknown data source format: {}", s)))
}

fn parse_column_type_name(s: &str) -> Result<ColumnTypeName, DomainError> {
    ColumnTypeName::from_str(s)
        .ok_or_else(|| DomainError::Internal(format!("Unknown column type name: {}", s)))
}

async fn fetch_columns(pool: &PgPool, table_id: Uuid) -> Result<Vec<ColumnInfo>, DomainError> {
    let rows = sqlx::query_as::<_, ColumnRow>(
        "SELECT name, convert_from(lo_get(type_text), 'UTF8') as type_text,
                type_json, type_name, type_precision, type_scale,
                type_interval_type, ordinal_position, comment, nullable, partition_index
         FROM uc_columns WHERE table_id = $1 ORDER BY ordinal_position ASC",
    )
    .bind(table_id)
    .fetch_all(pool)
    .await
    .map_err(|e| DomainError::Internal(e.to_string()))?;

    let mut columns = Vec::with_capacity(rows.len());
    for row in rows {
        columns.push(ColumnInfo {
            name: row.name,
            type_text: row.type_text,
            type_json: row.type_json,
            type_name: parse_column_type_name(&row.type_name)?,
            type_precision: row.type_precision,
            type_scale: row.type_scale,
            type_interval_type: row.type_interval_type,
            position: row.ordinal_position as i32,
            comment: row.comment,
            nullable: Some(row.nullable),
            partition_index: row.partition_index.map(|v| v as i32),
        });
    }
    Ok(columns)
}

fn row_to_table_info(
    row: TableRow,
    columns: Vec<ColumnInfo>,
    properties: Option<HashMap<String, String>>,
) -> Result<TableInfo, DomainError> {
    let table_type = row
        .table_type
        .as_deref()
        .map(parse_table_type)
        .transpose()?;
    let data_source_format = row
        .data_source_format
        .as_deref()
        .map(parse_data_source_format)
        .transpose()?;
    let full_name = format!("{}.{}.{}", row.catalog_name, row.schema_name, row.name);
    Ok(TableInfo {
        table_id: row.id,
        name: row.name,
        catalog_name: row.catalog_name,
        schema_name: row.schema_name,
        full_name,
        table_type,
        data_source_format,
        columns: Some(columns),
        url: row.url,
        comment: row.comment,
        properties,
        owner: row.owner,
        column_count: row.column_count,
        created_at: row.created_at.map(|t| t.and_utc().timestamp_millis()),
        created_by: row.created_by,
        updated_at: row.updated_at.map(|t| t.and_utc().timestamp_millis()),
        updated_by: row.updated_by,
        view_definition: row.view_definition,
        view_dependencies: None,
        uniform_iceberg_converted_delta_timestamp: row
            .uniform_iceberg_converted_delta_timestamp
            .map(|t| t.and_utc().timestamp_millis()),
        uniform_iceberg_converted_delta_version: row.uniform_iceberg_converted_delta_version,
        uniform_iceberg_metadata_location: row.uniform_iceberg_metadata_location,
    })
}

#[async_trait]
impl TableRepository for PgTableRepository {
    async fn create(&self, cmd: CreateTable) -> Result<TableInfo, DomainError> {
        // Look up schema
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
            "INSERT INTO uc_tables (id, schema_id, name, \"type\", data_source_format,
             url, comment, owner, column_count, created_at, updated_at, view_definition,
             uniform_iceberg_converted_delta_timestamp, uniform_iceberg_converted_delta_version,
             uniform_iceberg_metadata_location)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                     CASE WHEN $12 IS NOT NULL THEN lo_from_bytea(0, convert_to($12, 'UTF8')) END,
                     $13, $14, $15)",
        )
        .bind(id)
        .bind(schema_id)
        .bind(&cmd.name)
        .bind(cmd.table_type.as_ref().map(|t| t.as_str()))
        .bind(cmd.data_source_format.as_ref().map(|f| f.as_str()))
        .bind(&cmd.url)
        .bind(&cmd.comment)
        .bind(None::<String>)
        .bind(cmd.column_count)
        .bind(now)
        .bind(now)
        .bind(&cmd.view_definition)
        .bind(cmd.uniform_iceberg_converted_delta_timestamp.map(|ms| {
            chrono::DateTime::from_timestamp_millis(ms)
                .unwrap_or_default()
                .naive_utc()
        }))
        .bind(cmd.uniform_iceberg_converted_delta_version)
        .bind(&cmd.uniform_iceberg_metadata_location)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| {
            if is_unique_violation(&e) {
                DomainError::AlreadyExists(format!(
                    "Table already exists: {}.{}.{}",
                    cmd.catalog_name, cmd.schema_name, cmd.name
                ))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;

        // Insert columns
        for (i, col) in cmd.columns.iter().enumerate() {
            let col_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO uc_columns (id, table_id, name, ordinal_position, type_text, type_json,
                 type_name, type_precision, type_scale, type_interval_type, nullable, comment, partition_index)
                 VALUES ($1, $2, $3, $4, lo_from_bytea(0, convert_to($5, 'UTF8')), $6,
                         $7, $8, $9, $10, $11, $12, $13)",
            )
            .bind(col_id)
            .bind(id)
            .bind(&col.name)
            .bind(i as i16)
            .bind(&col.type_text)
            .bind(&col.type_json)
            .bind(col.type_name.as_str())
            .bind(col.type_precision)
            .bind(col.type_scale)
            .bind(&col.type_interval_type)
            .bind(col.nullable.unwrap_or(true))
            .bind(&col.comment)
            .bind(col.partition_index.map(|v| v as i16))
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;
        }

        if let Some(props) = &cmd.properties {
            upsert_properties(self.pool.as_ref(), id, "TABLE", props).await?;
        }

        let row = sqlx::query_as::<_, TableRow>(&format!("{} WHERE t.id = $1", TABLE_SELECT))
            .bind(id)
            .fetch_one(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        let columns = fetch_columns(self.pool.as_ref(), id).await?;
        let properties = fetch_properties(self.pool.as_ref(), id, "TABLE").await?;
        row_to_table_info(row, columns, properties)
    }

    async fn list(
        &self,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListTablesResponse, DomainError> {
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor = decode_page_token(&token)?;
            sqlx::query_as::<_, TableRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 AND t.name > $3 ORDER BY t.name ASC LIMIT $4",
                TABLE_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, TableRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 ORDER BY t.name ASC LIMIT $3",
                TABLE_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<TableRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last().map(|r| encode_page_token(&r.name))
        } else {
            None
        };

        let mut tables = Vec::with_capacity(rows.len());
        for row in rows {
            let id = row.id;
            let columns = fetch_columns(self.pool.as_ref(), id).await?;
            let props = fetch_properties(self.pool.as_ref(), id, "TABLE").await?;
            tables.push(row_to_table_info(row, columns, props)?);
        }

        Ok(ListTablesResponse {
            tables,
            next_page_token,
        })
    }

    async fn get(&self, full_name: &str) -> Result<TableInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.table, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, table_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, TableRow>(&format!(
            "{} WHERE c.name = $1 AND s.name = $2 AND t.name = $3",
            TABLE_SELECT
        ))
        .bind(catalog_name)
        .bind(schema_name)
        .bind(table_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Table not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        let id = row.id;
        let columns = fetch_columns(self.pool.as_ref(), id).await?;
        let properties = fetch_properties(self.pool.as_ref(), id, "TABLE").await?;
        row_to_table_info(row, columns, properties)
    }

    async fn get_by_id(&self, table_id: Uuid) -> Result<TableInfo, DomainError> {
        let row = sqlx::query_as::<_, TableRow>(&format!("{} WHERE t.id = $1", TABLE_SELECT))
            .bind(table_id)
            .fetch_one(self.pool.as_ref())
            .await
            .map_err(|e| match e {
                sqlx::Error::RowNotFound => {
                    DomainError::NotFound(format!("Table not found: {}", table_id))
                }
                e => DomainError::Internal(e.to_string()),
            })?;

        let columns = fetch_columns(self.pool.as_ref(), table_id).await?;
        let properties = fetch_properties(self.pool.as_ref(), table_id, "TABLE").await?;
        row_to_table_info(row, columns, properties)
    }

    async fn delete(&self, full_name: &str) -> Result<(), DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.table, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, table_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, (Uuid,)>(
            "SELECT t.id FROM uc_tables t
             JOIN uc_schemas s ON t.schema_id = s.id
             JOIN uc_catalogs c ON s.catalog_id = c.id
             WHERE c.name = $1 AND s.name = $2 AND t.name = $3",
        )
        .bind(catalog_name)
        .bind(schema_name)
        .bind(table_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Table not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        delete_properties(self.pool.as_ref(), row.0, "TABLE").await?;
        // uc_columns cascade-deletes automatically
        sqlx::query("DELETE FROM uc_tables WHERE id = $1")
            .bind(row.0)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        Ok(())
    }
}
