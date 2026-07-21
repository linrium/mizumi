use std::{env, net::SocketAddr, process::Stdio, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::{io::AsyncReadExt, process::Command, time};

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
    duckdb_bin: String,
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
            duckdb_bin: env_or("DUCKDB_BIN", "/usr/local/bin/duckdb"),
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

    match run_duckdb_query(&state.config, &req.sql, token).await {
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
    config: &Config,
    sql: &str,
    token: &str,
) -> Result<QueryResponse, Box<dyn std::error::Error + Send + Sync>> {
    let full_sql = format!(
        "{}\n{}\n{}",
        base_duckdb_sql(config, token),
        attach_catalogs_sql(),
        sql
    );

    let mut child = Command::new(&config.duckdb_bin)
        .arg("-json")
        .arg("-c")
        .arg(full_sql)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let mut stdout = child.stdout.take().expect("duckdb stdout pipe missing");
    let mut stderr = child.stderr.take().expect("duckdb stderr pipe missing");

    let stdout_task = tokio::spawn(async move {
        let mut buf = String::new();
        stdout.read_to_string(&mut buf).await.map(|_| buf)
    });
    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        stderr.read_to_string(&mut buf).await.map(|_| buf)
    });

    let status = match time::timeout(time::Duration::from_secs(120), child.wait()).await {
        Ok(status) => status?,
        Err(_) => {
            let _ = child.kill().await;
            return Err("DuckDB query timed out after 120 seconds".into());
        }
    };

    let stdout = stdout_task.await??;
    let stderr = stderr_task.await??;

    if !status.success() {
        let message = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(message.to_string().into());
    }

    let Some(last_json_line) = stdout.lines().filter(|line| !line.trim().is_empty()).last() else {
        return Ok(QueryResponse {
            columns: vec![],
            rows: vec![],
            row_count: 0,
        });
    };

    let objects: Vec<Map<String, Value>> = serde_json::from_str(last_json_line)?;
    let columns: Vec<String> = objects
        .first()
        .map(|row| row.keys().cloned().collect())
        .unwrap_or_default();
    let rows: Vec<Vec<Value>> = objects
        .iter()
        .map(|row| {
            columns
                .iter()
                .map(|column| row.get(column).cloned().unwrap_or(Value::Null))
                .collect()
        })
        .collect();

    Ok(QueryResponse {
        row_count: rows.len(),
        columns,
        rows,
    })
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
