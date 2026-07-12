use std::sync::OnceLock;

use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::infrastructure::{config::Config, telemetry};

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static DAGSTER_BASE_URL: OnceLock<String> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(reqwest::Client::new)
}

fn dagster_graphql_url() -> String {
    let base_url = DAGSTER_BASE_URL
        .get_or_init(|| {
            Config::load()
                .map(|config| config.dagster.base_url)
                .unwrap_or_else(|_| "http://localhost:8080".to_string())
        })
        .clone();
    format!("{}/graphql", base_url.trim_end_matches('/'))
}

pub(crate) const REPO_LOCATION: &str = "mizumi";
pub(crate) const REPO_NAME: &str = "__repository__";

// ---- GraphQL helpers ----

#[derive(Deserialize)]
struct GqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

pub(crate) async fn gql_post<T: for<'de> Deserialize<'de>>(
    query: &str,
    variables: Value,
) -> Result<T, (StatusCode, Value)> {
    let body = json!({ "query": query, "variables": variables });
    let resp = telemetry::inject_trace(
        client().post(dagster_graphql_url()).json(&body),
    )
    .send()
    .await
    .map_err(|e| {
            tracing::error!("Dagster request failed: {e}");
            (StatusCode::BAD_GATEWAY, json!({ "error": e.to_string() }))
        })?;

    let body = resp.text().await.map_err(|e| {
        tracing::error!("Failed to read Dagster response body: {e}");
        (StatusCode::BAD_GATEWAY, json!({ "error": e.to_string() }))
    })?;

    let gql: GqlResponse<T> = serde_json::from_str(&body).map_err(|e| {
        tracing::error!("Failed to parse Dagster response: {e}\nBody: {body}");
        (
            StatusCode::BAD_GATEWAY,
            json!({ "error": format!("invalid response from Dagster: {e}") }),
        )
    })?;

    if let Some(errors) = gql.errors {
        let msg = errors
            .iter()
            .map(|e| e.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        tracing::error!("Dagster GraphQL errors: {msg}");
        return Err((StatusCode::BAD_GATEWAY, json!({ "error": msg })));
    }

    gql.data.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            json!({ "error": "empty response from Dagster" }),
        )
    })
}
