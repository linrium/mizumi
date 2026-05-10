use std::sync::OnceLock;

use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use serde_json::json;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(reqwest::Client::new)
}

fn dagster_graphql_url() -> String {
    std::env::var("DAGSTER_BASE_URL").unwrap_or_else(|_| {
        "http://dagster-dagster-webserver.dagster.svc.cluster.local:80".to_string()
    }) + "/graphql"
}

const ASSETS_QUERY: &str = r#"
query {
  assetRecordsOrError {
    ... on AssetRecordConnection {
      cursor
      assets {
        id
        key { path }
      }
    }
  }
}"#;

// ---- GraphQL response types (internal) ----

#[derive(Deserialize)]
struct GqlResponse {
    data: Option<GqlData>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlData {
    #[serde(rename = "assetRecordsOrError")]
    asset_records_or_error: AssetRecordsOrError,
}

#[derive(Deserialize)]
struct AssetRecordsOrError {
    cursor: Option<String>,
    assets: Option<Vec<GqlAsset>>,
}

#[derive(Deserialize)]
struct GqlAsset {
    id: String,
    key: AssetKey,
}

#[derive(Deserialize)]
struct AssetKey {
    path: Vec<String>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

// ---- REST response types ----

#[derive(Serialize)]
pub struct AssetsResponse {
    pub assets: Vec<Asset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Serialize)]
pub struct Asset {
    pub id: String,
    pub path: Vec<String>,
}

// ---- Handler ----

pub async fn list_assets() -> impl IntoResponse {
    let body = json!({ "query": ASSETS_QUERY });

    let resp = match client().post(dagster_graphql_url()).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Dagster request failed: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let gql: GqlResponse = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("Failed to parse Dagster response: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "invalid response from Dagster" })),
            )
                .into_response();
        }
    };

    if let Some(errors) = gql.errors {
        let messages: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
        tracing::error!("Dagster GraphQL errors: {:?}", messages);
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": messages.join("; ") })),
        )
            .into_response();
    }

    let connection = gql
        .data
        .map(|d| d.asset_records_or_error)
        .unwrap_or(AssetRecordsOrError { cursor: None, assets: None });

    let assets = connection
        .assets
        .unwrap_or_default()
        .into_iter()
        .map(|a| Asset { id: a.id, path: a.key.path })
        .collect();

    Json(AssetsResponse { assets, cursor: connection.cursor }).into_response()
}
