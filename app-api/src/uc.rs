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

fn uc_base() -> String {
    std::env::var("UC_BASE_URL").unwrap_or_else(|_| {
        "http://localhost:8082/api/2.1/unity-catalog"
            .to_string()
    })
}

pub async fn proxy(request: Request) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let headers = request.headers().clone();

    let path = uri.path().strip_prefix("/uc").unwrap_or(uri.path());
    let uc_url = match uri.query() {
        Some(q) => format!("{}{}?{}", uc_base(), path, q),
        None => format!("{}{}", uc_base(), path),
    };

    let body_bytes = match to_bytes(request.into_body(), 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let req_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .unwrap_or(reqwest::Method::GET);

    let mut req_builder = client().request(req_method, &uc_url);

    req_builder = req_builder.header("Authorization", "Bearer eyJraWQiOiI2YWQ2NmE1ZjU2NmJjYWUzZDBjYTk2YjE1ZjJhY2VhNTZlYzAyMDc0MDRlZTMzMjFmMGZiYmNlMzM3NjIwNjM5IiwiYWxnIjoiUlM1MTIiLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiJhZG1pbiIsImlzcyI6ImludGVybmFsIiwiaWF0IjoxNzc4NzM5NzU1LCJqdGkiOiIzNGE4NmQ1MS1iODY5LTQyYzctYjk4Ny1hM2VmNzBhODAwMmYiLCJ0eXBlIjoiU0VSVklDRSJ9.GnygoQb3bTQPj42w56vBO5YT83mKwTgKg40P6vv3PVfROItO0JJo9b4MJFr_fDE00IkNZ62dKn0_7sRHk5jZ7kldC3X6V6CiKcx1mSukt9SukY_eKKMPzIeteiHbMVDt4NshJpnZGX6PVoIkOoNRd34M__D8iphrIbLiuHUtW8dstN3QZVrHwVPa2Nk8icFKCVrTCoayBWm0i0MU046aOCiAufpqRZlnw8oGEOBBjksFU4Gba7c1wP1jpWRgUySPqu9hKLuzzkUHsttLQ603oDwCdwTsnuXgrEe4waIszmPZgQlmicgdqslJHhqiguLIwS62XuM50mdDXLChFQdxXg");

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

            println!("status: {status:?}");
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
                axum::Json(serde_json::json!({"message": e.to_string()})),
            )
                .into_response()
        }
    }
}
