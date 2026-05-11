use std::sync::OnceLock;

use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::Value;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(reqwest::Client::new)
}

fn uc_url(path: &str) -> String {
    let base = std::env::var("UC_BASE_URL").unwrap_or_else(|_| {
        "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080/api/2.1/unity-catalog"
            .to_string()
    });
    format!("{}/{}", base, path)
}

pub(crate) struct UcError(StatusCode, Value);

impl IntoResponse for UcError {
    fn into_response(self) -> Response {
        (self.0, Json(self.1)).into_response()
    }
}

async fn call(builder: reqwest::RequestBuilder) -> Result<(StatusCode, Value), UcError> {
    let resp = builder.send().await.map_err(|e| {
        tracing::error!("UC request failed: {e}");
        UcError(
            StatusCode::BAD_GATEWAY,
            serde_json::json!({"message": e.to_string()}),
        )
    })?;
    let status =
        StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(UcError(status, body));
    }
    Ok((status, body))
}

// ---- Query param types ----

#[derive(Deserialize)]
pub struct PaginationParams {
    pub max_results: Option<i64>,
    pub page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct ListSchemasParams {
    pub catalog_name: String,
    pub max_results: Option<i64>,
    pub page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct ListTablesParams {
    pub catalog_name: String,
    pub schema_name: String,
    pub max_results: Option<i64>,
    pub page_token: Option<String>,
}

#[derive(Deserialize)]
pub struct ForceDeleteParams {
    pub force: Option<bool>,
}

// ---- Catalog handlers ----

pub async fn list_catalogs(
    Query(params): Query<PaginationParams>,
) -> Result<impl IntoResponse, UcError> {
    let mut req = client().get(uc_url("catalogs"));
    if let Some(max) = params.max_results {
        req = req.query(&[("max_results", max)]);
    }
    if let Some(tok) = params.page_token {
        req = req.query(&[("page_token", tok)]);
    }
    let (status, body) = call(req).await?;
    Ok((status, Json(body)))
}

pub async fn get_catalog(Path(name): Path<String>) -> Result<impl IntoResponse, UcError> {
    let (status, body) = call(client().get(uc_url(&format!("catalogs/{name}")))).await?;
    Ok((status, Json(body)))
}

pub async fn create_catalog(Json(body): Json<Value>) -> Result<impl IntoResponse, UcError> {
    let (status, resp) = call(client().post(uc_url("catalogs")).json(&body)).await?;
    Ok((status, Json(resp)))
}

pub async fn update_catalog(
    Path(name): Path<String>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, UcError> {
    let (status, resp) = call(
        client()
            .patch(uc_url(&format!("catalogs/{name}")))
            .json(&body),
    )
    .await?;
    Ok((status, Json(resp)))
}

pub async fn delete_catalog(
    Path(name): Path<String>,
    Query(params): Query<ForceDeleteParams>,
) -> Result<impl IntoResponse, UcError> {
    let mut req = client().delete(uc_url(&format!("catalogs/{name}")));
    if let Some(force) = params.force {
        req = req.query(&[("force", force)]);
    }
    let (status, body) = call(req).await?;
    Ok((status, Json(body)))
}

// ---- Schema handlers ----

pub async fn list_schemas(
    Query(params): Query<ListSchemasParams>,
) -> Result<impl IntoResponse, UcError> {
    let mut req = client()
        .get(uc_url("schemas"))
        .query(&[("catalog_name", &params.catalog_name)]);
    if let Some(max) = params.max_results {
        req = req.query(&[("max_results", max)]);
    }
    if let Some(tok) = &params.page_token {
        req = req.query(&[("page_token", tok)]);
    }
    let (status, body) = call(req).await?;
    Ok((status, Json(body)))
}

pub async fn get_schema(Path(full_name): Path<String>) -> Result<impl IntoResponse, UcError> {
    let (status, body) = call(client().get(uc_url(&format!("schemas/{full_name}")))).await?;
    Ok((status, Json(body)))
}

pub async fn create_schema(Json(body): Json<Value>) -> Result<impl IntoResponse, UcError> {
    let (status, resp) = call(client().post(uc_url("schemas")).json(&body)).await?;
    Ok((status, Json(resp)))
}

pub async fn update_schema(
    Path(full_name): Path<String>,
    Json(body): Json<Value>,
) -> Result<impl IntoResponse, UcError> {
    let (status, resp) = call(
        client()
            .patch(uc_url(&format!("schemas/{full_name}")))
            .json(&body),
    )
    .await?;
    Ok((status, Json(resp)))
}

pub async fn delete_schema(
    Path(full_name): Path<String>,
    Query(params): Query<ForceDeleteParams>,
) -> Result<impl IntoResponse, UcError> {
    let mut req = client().delete(uc_url(&format!("schemas/{full_name}")));
    if let Some(force) = params.force {
        req = req.query(&[("force", force)]);
    }
    let (status, body) = call(req).await?;
    Ok((status, Json(body)))
}

// ---- Table handlers ----

pub async fn list_tables(
    Query(params): Query<ListTablesParams>,
) -> Result<impl IntoResponse, UcError> {
    let mut req = client().get(uc_url("tables")).query(&[
        ("catalog_name", &params.catalog_name),
        ("schema_name", &params.schema_name),
    ]);
    if let Some(max) = params.max_results {
        req = req.query(&[("max_results", max)]);
    }
    if let Some(tok) = &params.page_token {
        req = req.query(&[("page_token", tok)]);
    }
    let (status, body) = call(req).await?;
    Ok((status, Json(body)))
}

pub async fn get_table(Path(full_name): Path<String>) -> Result<impl IntoResponse, UcError> {
    let (status, body) = call(client().get(uc_url(&format!("tables/{full_name}")))).await?;
    Ok((status, Json(body)))
}

pub async fn create_table(Json(body): Json<Value>) -> Result<impl IntoResponse, UcError> {
    let (status, resp) = call(client().post(uc_url("tables")).json(&body)).await?;
    Ok((status, Json(resp)))
}

pub async fn delete_table(Path(full_name): Path<String>) -> Result<impl IntoResponse, UcError> {
    let (status, body) = call(client().delete(uc_url(&format!("tables/{full_name}")))).await?;
    Ok((status, Json(body)))
}
