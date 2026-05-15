use crate::infrastructure::server::AppState;
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine as _;
use std::sync::Arc;

/// Tower middleware that validates `Authorization: Bearer <token>` on every
/// request to the protected API. Inserts the principal (email or sub) as
/// `Extension<String>` for downstream handlers.
///
/// Validation order:
/// 1. Internal token (`iss: "internal"`) → validated against local RSA key only.
///    Never falls through to OIDC, so a wrong/expired internal token → 401 immediately.
/// 2. External OIDC token → validated against the configured issuer
///    (only when `authorization = "enable"`).
/// 3. No token and auth disabled → principal `"anonymous"`.
pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let token = extract_bearer(request.headers());

    if let Some(ref t) = token {
        // Route by issuer without full verification
        match peek_issuer(t).as_deref() {
            Some("internal") => {
                // Internal token — only try the local key, never OIDC
                return match state.token_manager.validate(t) {
                    Ok(claims) => {
                        let principal = claims.email.unwrap_or(claims.sub);
                        request.extensions_mut().insert(principal);
                        next.run(request).await
                    }
                    Err(_) => unauthorized("Invalid internal token").into_response(),
                };
            }
            _ => {
                // External OIDC token
                if let Some(validator) = state.jwt_validator.as_ref() {
                    return match validator.validate(t).await {
                        Ok(claims) => {
                            let principal = claims.email.unwrap_or(claims.sub);
                            request.extensions_mut().insert(principal);
                            next.run(request).await
                        }
                        Err(e) => unauthorized(&e.to_string()).into_response(),
                    };
                }
                // Auth disabled but a non-internal token was supplied — treat as anonymous
                // (don't block; let the no-op authorizer handle it)
            }
        }
    }

    // No token (or auth disabled with non-internal token) → anonymous
    if state.jwt_validator.is_some() {
        // Auth is enabled and there is no recognisable token
        return unauthorized("Missing or malformed Authorization header").into_response();
    }

    request.extensions_mut().insert("anonymous".to_string());
    next.run(request).await
}

fn unauthorized(msg: &str) -> impl IntoResponse {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "error_code": 401, "message": msg })),
    )
}

/// Decode the JWT payload without signature verification to read the `iss` claim.
fn peek_issuer(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(padding_fix(payload).as_bytes())
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    v.get("iss")?.as_str().map(|s| s.to_owned())
}

/// Add the `=` padding that base64 may require.
fn padding_fix(s: &str) -> String {
    let pad = (4 - s.len() % 4) % 4;
    format!("{}{}", s, "=".repeat(pad))
}

fn extract_bearer(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim().to_owned())
}

/// Debug middleware that logs every request and response (method, URI, headers, body).
/// Only emits output when the `debug` or `trace` log level is active.
pub async fn debug_log(request: Request<Body>, next: Next) -> Response {
    if !tracing::enabled!(tracing::Level::DEBUG) {
        return next.run(request).await;
    }

    let method = request.method().clone();
    let uri = request.uri().clone();
    let req_headers = request.headers().clone();

    let (parts, body) = request.into_parts();
    let req_bytes = axum::body::to_bytes(body, usize::MAX)
        .await
        .unwrap_or_default();

    tracing::debug!(
        method = %method,
        uri = %uri,
        headers = ?req_headers,
        body = %String::from_utf8_lossy(&req_bytes),
        "→ request",
    );

    let request = Request::from_parts(parts, Body::from(req_bytes));
    let response = next.run(request).await;

    let status = response.status();
    let res_headers = response.headers().clone();
    let (res_parts, res_body) = response.into_parts();
    let res_bytes = axum::body::to_bytes(res_body, usize::MAX)
        .await
        .unwrap_or_default();

    tracing::debug!(
        status = %status,
        headers = ?res_headers,
        body = %String::from_utf8_lossy(&res_bytes),
        "← response",
    );

    Response::from_parts(res_parts, Body::from(res_bytes))
}
