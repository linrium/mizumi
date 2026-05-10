mod dagster;
mod error;
mod k8s;
mod models;
mod uc;

use axum::{Router, http::StatusCode, routing::{get, post}};
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/livez", get(|| async { StatusCode::OK }))
        .route("/readyz", get(|| async { StatusCode::OK }))
        .route("/api/query", post(k8s::run_query))
        .route("/dagster/assets", get(dagster::list_assets))
        // Catalog routes
        .route("/uc/catalogs", get(uc::list_catalogs).post(uc::create_catalog))
        .route(
            "/uc/catalogs/{name}",
            get(uc::get_catalog).patch(uc::update_catalog).delete(uc::delete_catalog),
        )
        // Schema routes
        .route("/uc/schemas", get(uc::list_schemas).post(uc::create_schema))
        .route(
            "/uc/schemas/{full_name}",
            get(uc::get_schema).patch(uc::update_schema).delete(uc::delete_schema),
        )
        // Table routes
        .route("/uc/tables", get(uc::list_tables).post(uc::create_table))
        .route("/uc/tables/{full_name}", get(uc::get_table).delete(uc::delete_table))
        .layer(CorsLayer::permissive());

    let addr = "0.0.0.0:6000";
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
