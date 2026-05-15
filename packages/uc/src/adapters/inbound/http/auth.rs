use crate::{
    adapters::inbound::http::error::AppError, domain::error::DomainError,
    infrastructure::server::AppState,
};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

/// Query params returned by the OAuth2 provider to the callback URL.
#[derive(Deserialize)]
pub struct CallbackParams {
    pub code: String,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Successful token response forwarded to the caller.
#[derive(Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub scope: Option<String>,
}

/// `GET /auth/login`
///
/// Redirects the browser to the configured OAuth2 authorization endpoint.
/// The `state` parameter is a random UUID used for basic CSRF protection.
pub async fn login(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, AppError> {
    let oauth2 = state
        .oauth2
        .as_ref()
        .ok_or_else(|| DomainError::InvalidArgument("Authorization is not configured".into()))?;

    let csrf_state = Uuid::new_v4().to_string();

    let url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope=openid+email+profile&state={}",
        oauth2.authorization_url,
        urlenccode(&oauth2.client_id),
        urlenccode(&oauth2.redirect_uri),
        csrf_state,
    );

    Ok(Redirect::temporary(&url))
}

/// `GET /auth/callback?code=...&state=...`
///
/// Exchanges the authorization code for tokens by calling the token endpoint,
/// then returns the token payload as JSON.
pub async fn callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CallbackParams>,
) -> Result<impl IntoResponse, AppError> {
    // Surface provider errors (e.g. user denied access)
    if let Some(err) = params.error {
        let desc = params.error_description.unwrap_or_default();
        return Err(DomainError::InvalidArgument(format!("OAuth2 error: {err} — {desc}")).into());
    }

    let oauth2 = state
        .oauth2
        .as_ref()
        .ok_or_else(|| DomainError::InvalidArgument("Authorization is not configured".into()))?;

    let http = reqwest::Client::new();
    let resp = http
        .post(&oauth2.token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &params.code),
            ("redirect_uri", &oauth2.redirect_uri),
            ("client_id", &oauth2.client_id),
            ("client_secret", &oauth2.client_secret),
        ])
        .send()
        .await
        .map_err(|e| DomainError::Internal(format!("Token exchange request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(
            DomainError::Internal(format!("Token exchange failed ({status}): {body}")).into(),
        );
    }

    let tokens: TokenResponse = resp
        .json()
        .await
        .map_err(|e| DomainError::Internal(format!("Token response parse error: {e}")))?;

    Ok((StatusCode::OK, Json(tokens)))
}

/// Minimal percent-encoding for query parameter values (encodes space, +, & etc.).
fn urlenccode(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => {
                vec![c]
            }
            c => format!("%{:02X}", c as u32).chars().collect(),
        })
        .collect()
}
