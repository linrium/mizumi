mod error;
mod k8s;
mod models;

use axum::{Router, http::StatusCode, routing::{get, post}};
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/livez", get(|| async { StatusCode::OK }))
        .route("/readyz", get(|| async { StatusCode::OK }))
        .route("/api/query", post(k8s::run_query))
        .layer(CorsLayer::permissive());

    let addr = "0.0.0.0:6000";
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
