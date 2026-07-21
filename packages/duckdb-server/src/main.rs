use std::{env, net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use duckdb::{Connection, types::ValueRef};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value, json};
use tokio::time;

const CATALOG_DEFAULT_SCHEMAS: &[(&str, &str)] = &[
    ("hdbank", "hdbank_partnership_prod_bronze"),
    ("vietjetair", "vietjetair_partnership_prod_bronze"),
    ("partnership", "co_brand_silver"),
];

#[derive(Clone)]
struct Config {
    uc_endpoint: String,
    uc_aws_region: String,
    s3_endpoint: String,
    s3_access_key: String,
    s3_secret_key: String,
    s3_region: String,
}

#[derive(Clone)]
struct AppState {
    config: Arc<Config>,
}

#[derive(Deserialize)]
struct QueryRequest {
    sql: String,
    uc_token: Option<String>,
}

#[derive(Serialize)]
struct QueryResponse {
    columns: Vec<String>,
    rows: Vec<Vec<Value>>,
    row_count: usize,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "duckdb_server=info,tower_http=info".into()),
        )
        .init();

    let port = env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8080);
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));

    let state = AppState {
        config: Arc::new(Config::from_env()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/query", post(query))
        .with_state(state);

    tracing::info!(%bind_addr, "listening");
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

impl Config {
    fn from_env() -> Self {
        Self {
            uc_endpoint: env_or(
                "DUCKDB_UC_ENDPOINT",
                "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080",
            ),
            uc_aws_region: env_or("DUCKDB_UC_AWS_REGION", "us-east-1"),
            s3_endpoint: env_or(
                "AWS_ENDPOINT_URL",
                "http://rustfs-svc.rustfs.svc.cluster.local:9000",
            ),
            s3_access_key: env_or("AWS_ACCESS_KEY_ID", "rustfsadmin"),
            s3_secret_key: env_or("AWS_SECRET_ACCESS_KEY", "rustfsadmin"),
            s3_region: env_or("AWS_DEFAULT_REGION", "us-east-1"),
        }
    }
}

fn env_or(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn query(State(state): State<AppState>, Json(req): Json<QueryRequest>) -> Response {
    let Some(token) = req.uc_token.as_deref().filter(|token| !token.is_empty()) else {
        return error_response(
            StatusCode::BAD_REQUEST,
            "uc_token is required for Unity Catalog queries",
        );
    };

    match run_duckdb_query(state.config.clone(), req.sql, token.to_string()).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => error_response(StatusCode::BAD_REQUEST, &error.to_string()),
    }
}

fn error_response(status: StatusCode, error: &str) -> Response {
    (
        status,
        Json(ErrorResponse {
            error: error.to_string(),
        }),
    )
        .into_response()
}

async fn run_duckdb_query(
    config: Arc<Config>,
    sql: String,
    token: String,
) -> Result<QueryResponse, Box<dyn std::error::Error + Send + Sync>> {
    match time::timeout(
        time::Duration::from_secs(120),
        tokio::task::spawn_blocking(move || run_duckdb_query_blocking(&config, &sql, &token)),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => Err("DuckDB query timed out after 120 seconds".into()),
    }
}

fn run_duckdb_query_blocking(
    config: &Config,
    sql: &str,
    token: &str,
) -> Result<QueryResponse, Box<dyn std::error::Error + Send + Sync>> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(&format!(
        "{}\n{}",
        base_duckdb_sql(config, token),
        attach_catalogs_sql()
    ))?;

    let mut stmt = conn.prepare(sql)?;
    let mut query_rows = stmt.query([])?;
    let stmt_ref = query_rows
        .as_ref()
        .ok_or("DuckDB query did not return statement metadata")?;
    let columns = (0..stmt_ref.column_count())
        .map(|index| stmt_ref.column_name(index).cloned())
        .collect::<duckdb::Result<Vec<_>>>()?;

    let mut rows = Vec::new();
    while let Some(row) = query_rows.next()? {
        let mut values = Vec::with_capacity(columns.len());
        for index in 0..columns.len() {
            values.push(value_ref_to_json(row.get_ref(index)?));
        }
        rows.push(values);
    }

    Ok(QueryResponse {
        row_count: rows.len(),
        columns,
        rows,
    })
}

fn value_ref_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Boolean(value) => Value::Bool(value),
        ValueRef::TinyInt(value) => json!(value),
        ValueRef::SmallInt(value) => json!(value),
        ValueRef::Int(value) => json!(value),
        ValueRef::BigInt(value) => json!(value),
        ValueRef::HugeInt(value) => Value::String(value.to_string()),
        ValueRef::UTinyInt(value) => json!(value),
        ValueRef::USmallInt(value) => json!(value),
        ValueRef::UInt(value) => json!(value),
        ValueRef::UBigInt(value) => json!(value),
        ValueRef::Float(value) => number_or_null(value as f64),
        ValueRef::Double(value) => number_or_null(value),
        ValueRef::Decimal(value) => Value::String(value.to_string()),
        ValueRef::Timestamp(unit, value) => {
            json!({ "unit": format!("{unit:?}"), "value": value })
        }
        ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).into_owned()),
        ValueRef::Blob(value) => Value::String(format!("\\x{}", bytes_to_hex(value))),
        ValueRef::Date32(value) => json!(value),
        ValueRef::Time64(unit, value) => {
            json!({ "unit": format!("{unit:?}"), "value": value })
        }
        ValueRef::Interval {
            months,
            days,
            nanos,
        } => json!({
            "months": months,
            "days": days,
            "nanos": nanos,
        }),
        ValueRef::List(_, _)
        | ValueRef::Enum(_, _)
        | ValueRef::Struct(_, _)
        | ValueRef::Array(_, _)
        | ValueRef::Map(_, _)
        | ValueRef::Union(_, _) => Value::String(format!("{value:?}")),
    }
}

fn number_or_null(value: f64) -> Value {
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut hex = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        hex.push(HEX[(byte >> 4) as usize] as char);
        hex.push(HEX[(byte & 0x0f) as usize] as char);
    }
    hex
}

fn base_duckdb_sql(config: &Config, token: &str) -> String {
    let endpoint_host = config
        .s3_endpoint
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/');
    let use_ssl = config.s3_endpoint.starts_with("https://");

    format!(
        r#"
        LOAD httpfs;
        LOAD delta;
        LOAD unity_catalog;

        CREATE OR REPLACE SECRET __s3__ (
            TYPE s3,
            KEY_ID '{}',
            SECRET '{}',
            ENDPOINT '{}',
            USE_SSL {},
            URL_STYLE 'path',
            REGION '{}'
        );

        CREATE OR REPLACE SECRET (
            TYPE unity_catalog,
            TOKEN '{}',
            ENDPOINT '{}',
            AWS_REGION '{}',
            S3_ENDPOINT '{}',
            S3_USE_SSL {},
            S3_URL_STYLE 'path'
        );
        "#,
        sql_quote(&config.s3_access_key),
        sql_quote(&config.s3_secret_key),
        sql_quote(endpoint_host),
        use_ssl,
        sql_quote(&config.s3_region),
        sql_quote(token),
        sql_quote(&config.uc_endpoint),
        sql_quote(&config.uc_aws_region),
        sql_quote(endpoint_host),
        use_ssl
    )
}

fn attach_catalogs_sql() -> String {
    CATALOG_DEFAULT_SCHEMAS
        .iter()
        .map(|(name, default_schema)| {
            format!(
                r#"
                ATTACH IF NOT EXISTS '{}' AS {} (
                    TYPE unity_catalog,
                    DEFAULT_SCHEMA '{}',
                    READ_ONLY
                );
                "#,
                sql_quote(name),
                name,
                sql_quote(default_schema)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn sql_quote(value: &str) -> String {
    value.replace('\'', "''")
}
