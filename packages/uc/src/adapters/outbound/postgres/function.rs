use super::{decode_page_token, encode_page_token, is_unique_violation};
use crate::domain::{
    entities::{function::*, table::ColumnTypeName},
    error::DomainError,
    ports::outbound::FunctionRepository,
};
use async_trait::async_trait;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct PgFunctionRepository {
    pool: Arc<PgPool>,
}

impl PgFunctionRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct FunctionRow {
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
    data_type: Option<String>,
    full_data_type: Option<String>,
    input_params: Option<serde_json::Value>,
    return_params: Option<serde_json::Value>,
    routine_body: Option<String>,
    routine_definition: Option<String>,
    sql_data_access: Option<String>,
    is_deterministic: Option<bool>,
    is_null_call: Option<bool>,
    parameter_style: Option<String>,
    security_type: Option<String>,
    specific_name: Option<String>,
    external_language: Option<String>,
}

const FUNCTION_SELECT: &str = "SELECT f.id, f.name, s.name as schema_name, c.name as catalog_name,
            f.comment, f.owner, f.created_at, f.created_by, f.updated_at, f.updated_by,
            f.data_type, f.full_data_type, f.input_params, f.return_params,
            f.routine_body, f.routine_definition, f.sql_data_access,
            f.is_deterministic, f.is_null_call, f.parameter_style, f.security_type,
            f.specific_name, f.external_language
     FROM uc_functions f
     JOIN uc_schemas s ON f.schema_id = s.id
     JOIN uc_catalogs c ON s.catalog_id = c.id";

fn row_to_function_info(row: FunctionRow) -> Result<FunctionInfo, DomainError> {
    let data_type = row
        .data_type
        .as_deref()
        .map(|s| {
            ColumnTypeName::from_str(s)
                .ok_or_else(|| DomainError::Internal(format!("Unknown column type: {}", s)))
        })
        .transpose()?;

    let input_params: Option<FunctionParameterInfos> = row
        .input_params
        .map(|v| {
            serde_json::from_value(v)
                .map_err(|e| DomainError::Internal(format!("Failed to parse input_params: {}", e)))
        })
        .transpose()?;

    let return_params: Option<FunctionParameterInfos> = row
        .return_params
        .map(|v| {
            serde_json::from_value(v)
                .map_err(|e| DomainError::Internal(format!("Failed to parse return_params: {}", e)))
        })
        .transpose()?;

    let full_name = format!("{}.{}.{}", row.catalog_name, row.schema_name, row.name);
    Ok(FunctionInfo {
        function_id: row.id,
        name: row.name,
        catalog_name: row.catalog_name,
        schema_name: row.schema_name,
        full_name,
        comment: row.comment,
        owner: row.owner,
        input_params,
        return_params,
        data_type,
        full_data_type: row.full_data_type,
        routine_body: row.routine_body,
        routine_definition: row.routine_definition,
        sql_data_access: row.sql_data_access,
        is_deterministic: row.is_deterministic,
        is_null_call: row.is_null_call,
        parameter_style: row.parameter_style,
        security_type: row.security_type,
        specific_name: row.specific_name,
        external_language: row.external_language,
        created_at: row.created_at.and_utc().timestamp_millis(),
        created_by: row.created_by,
        updated_at: row.updated_at.map(|t| t.and_utc().timestamp_millis()),
        updated_by: row.updated_by,
    })
}

#[async_trait]
impl FunctionRepository for PgFunctionRepository {
    async fn create(&self, cmd: CreateFunction) -> Result<FunctionInfo, DomainError> {
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

        let input_params_json = cmd
            .input_params
            .as_ref()
            .map(|p| serde_json::to_value(p).map_err(|e| DomainError::Internal(e.to_string())))
            .transpose()?;
        let return_params_json = cmd
            .return_params
            .as_ref()
            .map(|p| serde_json::to_value(p).map_err(|e| DomainError::Internal(e.to_string())))
            .transpose()?;

        sqlx::query(
            "INSERT INTO uc_functions (id, schema_id, name, comment, owner, created_at, updated_at,
             data_type, full_data_type, input_params, return_params, routine_body, routine_definition,
             sql_data_access, is_deterministic, is_null_call, parameter_style, security_type,
             specific_name, external_language)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)",
        )
        .bind(id)
        .bind(schema_id)
        .bind(&cmd.name)
        .bind(&cmd.comment)
        .bind(None::<String>)
        .bind(now)
        .bind(now)
        .bind(cmd.data_type.as_ref().map(|t| t.as_str()))
        .bind(&cmd.full_data_type)
        .bind(input_params_json)
        .bind(return_params_json)
        .bind(&cmd.routine_body)
        .bind(&cmd.routine_definition)
        .bind(&cmd.sql_data_access)
        .bind(cmd.is_deterministic)
        .bind(cmd.is_null_call)
        .bind(&cmd.parameter_style)
        .bind(&cmd.security_type)
        .bind(&cmd.specific_name)
        .bind(&cmd.external_language)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| {
            if is_unique_violation(&e) {
                DomainError::AlreadyExists(format!(
                    "Function already exists: {}.{}.{}",
                    cmd.catalog_name, cmd.schema_name, cmd.name
                ))
            } else {
                DomainError::Internal(e.to_string())
            }
        })?;

        let row = sqlx::query_as::<_, FunctionRow>(&format!("{} WHERE f.id = $1", FUNCTION_SELECT))
            .bind(id)
            .fetch_one(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;

        row_to_function_info(row)
    }

    async fn list(
        &self,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListFunctionsResponse, DomainError> {
        let limit = max_results.unwrap_or(100) as i64;

        let rows = if let Some(token) = page_token {
            let cursor = decode_page_token(&token)?;
            sqlx::query_as::<_, FunctionRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 AND f.name > $3 ORDER BY f.name ASC LIMIT $4",
                FUNCTION_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        } else {
            sqlx::query_as::<_, FunctionRow>(&format!(
                "{} WHERE c.name = $1 AND s.name = $2 ORDER BY f.name ASC LIMIT $3",
                FUNCTION_SELECT
            ))
            .bind(catalog_name)
            .bind(schema_name)
            .bind(limit + 1)
            .fetch_all(self.pool.as_ref())
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?
        };

        let has_more = rows.len() > limit as usize;
        let rows: Vec<FunctionRow> = rows.into_iter().take(limit as usize).collect();
        let next_page_token = if has_more {
            rows.last().map(|r| encode_page_token(&r.name))
        } else {
            None
        };

        let mut functions = Vec::with_capacity(rows.len());
        for row in rows {
            functions.push(row_to_function_info(row)?);
        }

        Ok(ListFunctionsResponse {
            functions,
            next_page_token,
        })
    }

    async fn get(&self, full_name: &str) -> Result<FunctionInfo, DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.function, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, function_name) = (parts[0], parts[1], parts[2]);

        let row = sqlx::query_as::<_, FunctionRow>(&format!(
            "{} WHERE c.name = $1 AND s.name = $2 AND f.name = $3",
            FUNCTION_SELECT
        ))
        .bind(catalog_name)
        .bind(schema_name)
        .bind(function_name)
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                DomainError::NotFound(format!("Function not found: {}", full_name))
            }
            e => DomainError::Internal(e.to_string()),
        })?;

        row_to_function_info(row)
    }

    async fn delete(&self, full_name: &str) -> Result<(), DomainError> {
        let parts: Vec<&str> = full_name.splitn(3, '.').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidArgument(format!(
                "Expected full_name as catalog.schema.function, got: {}",
                full_name
            )));
        }
        let (catalog_name, schema_name, function_name) = (parts[0], parts[1], parts[2]);

        let result = sqlx::query(
            "DELETE FROM uc_functions f
             USING uc_schemas s, uc_catalogs c
             WHERE f.schema_id = s.id AND s.catalog_id = c.id
               AND c.name = $1 AND s.name = $2 AND f.name = $3",
        )
        .bind(catalog_name)
        .bind(schema_name)
        .bind(function_name)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound(format!(
                "Function not found: {}",
                full_name
            )));
        }

        Ok(())
    }
}
