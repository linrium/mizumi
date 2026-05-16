use std::sync::OnceLock;

use axum::{
    body::to_bytes,
    extract::Request,
    http::StatusCode,
    response::{IntoResponse, Response},
};

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(reqwest::Client::new)
}

#[derive(Clone)]
pub struct UnityCatalogHttpProxy {
    base_url: String,
    admin_token: String,
}

#[derive(serde::Serialize)]
struct PermissionChange<'a> {
    principal: &'a str,
    add: &'a [String],
    remove: &'a [String],
}

#[derive(serde::Serialize)]
struct PatchPermissionsBody<'a> {
    changes: [PermissionChange<'a>; 1],
}

impl UnityCatalogHttpProxy {
    pub fn new(base_url: String, admin_token: String) -> Self {
        Self {
            base_url,
            admin_token,
        }
    }

    pub async fn proxy(&self, request: Request) -> Response {
        let method = request.method().clone();
        let uri = request.uri().clone();
        let headers = request.headers().clone();

        let path = uri.path().strip_prefix("/uc").unwrap_or(uri.path());
        let uc_url = match uri.query() {
            Some(q) => format!("{}{}?{}", self.base_url, path, q),
            None => format!("{}{}", self.base_url, path),
        };

        let body_bytes = match to_bytes(request.into_body(), 10 * 1024 * 1024).await {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };

        let req_method =
            reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);

        let mut req_builder = client().request(req_method, &uc_url);

        for name in ["authorization", "content-type", "accept"] {
            if let Some(value) = headers.get(name) {
                req_builder = req_builder.header(name, value);
            }
        }

        if !body_bytes.is_empty() {
            req_builder = req_builder.body(body_bytes.to_vec());
        }

        match req_builder.send().await {
            Ok(resp) => {
                let status = StatusCode::from_u16(resp.status().as_u16())
                    .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

                let content_type = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("application/json")
                    .to_owned();
                let body = resp.bytes().await.unwrap_or_default();
                let mut response = (status, body).into_response();
                if let Ok(ct) = content_type.parse::<axum::http::HeaderValue>() {
                    response.headers_mut().insert("content-type", ct);
                }
                response
            }
            Err(e) => {
                tracing::error!("UC proxy request failed: {e}");
                (
                    StatusCode::BAD_GATEWAY,
                    axum::Json(serde_json::json!({ "message": e.to_string() })),
                )
                    .into_response()
            }
        }
    }

    pub async fn grant_permissions(
        &self,
        scope: &str,
        resource: &str,
        principal: &str,
        privileges: &[String],
    ) -> Result<(), String> {
        let uc_url = format!("{}/permissions/{scope}/{resource}", self.base_url);
        let remove: Vec<String> = Vec::new();
        let body = PatchPermissionsBody {
            changes: [PermissionChange {
                principal,
                add: privileges,
                remove: &remove,
            }],
        };

        let response = client()
            .patch(&uc_url)
            .bearer_auth(&self.admin_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("UC permissions request failed: {e}"))?;

        if response.status().is_success() {
            return Ok(());
        }

        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!(
            "UC permissions request failed with {status}: {body}"
        ))
    }
}
