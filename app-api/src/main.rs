mod dagster;
mod error;
mod k8s;
mod models;
mod streaming;
mod tests;
mod uc;

use std::sync::Arc;

use axum::{
    Router,
    extract::FromRef,
    http::StatusCode,
    routing::{delete, get, post},
};
use rdkafka::{ClientConfig, producer::FutureProducer};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;

use error::AppError;
use k8s::SessionStore;
use tests::{
    publish_hdbank_customer_event, publish_hdbank_payment_event, publish_vietjetair_booking_event,
    publish_vietjetair_customer_event, publish_vietjetair_flight_event,
};

#[derive(Clone)]
pub struct AppState {
    pub sessions: Arc<SessionStore>,
    pub db: PgPool,
    pub kafka_producer: FutureProducer,
}

// Allows existing k8s handlers that extract State<Arc<SessionStore>> to keep working unchanged.
impl FromRef<AppState> for Arc<SessionStore> {
    fn from_ref(state: &AppState) -> Self {
        state.sessions.clone()
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or("postgres://app_api:app_api_password@localhost:5433/app_api".to_string());

    let db = PgPool::connect(&database_url)
        .await
        .expect("failed to connect to postgres");

    let kafka_bootstrap_servers =
        std::env::var("KAFKA_BOOTSTRAP_SERVERS").unwrap_or("127.0.0.1:19092".to_string());
    let kafka_producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &kafka_bootstrap_servers)
        .set("message.timeout.ms", "10000")
        .create()
        .expect("failed to create kafka producer");

    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("failed to run migrations");

    let state = AppState {
        sessions: k8s::new_session_store(),
        db,
        kafka_producer,
    };

    let app = Router::new()
        .route("/livez", get(|| async { StatusCode::OK }))
        .route("/readyz", get(|| async { StatusCode::OK }))
        // DuckDB query / session routes
        .route("/api/query", post(k8s::run_query))
        .route(
            "/api/sessions",
            get(k8s::list_sessions).post(k8s::create_session),
        )
        .route("/api/sessions/{id}", delete(k8s::delete_session))
        .route("/api/sessions/{id}/query", post(k8s::session_query))
        .route(
            "/api/tests/hdbank/payment-events",
            post(publish_hdbank_payment_event),
        )
        .route(
            "/api/tests/hdbank/customer-events",
            post(publish_hdbank_customer_event),
        )
        .route(
            "/api/tests/vietjetair/customer-events",
            post(publish_vietjetair_customer_event),
        )
        .route(
            "/api/tests/vietjetair/flight-events",
            post(publish_vietjetair_flight_event),
        )
        .route(
            "/api/tests/vietjetair/booking-events",
            post(publish_vietjetair_booking_event),
        )
        // Streaming job routes
        .route(
            "/api/streaming/jobs",
            get(streaming::list_streaming_jobs).post(streaming::create_streaming_job),
        )
        .route(
            "/api/streaming/jobs/{id}",
            get(streaming::get_streaming_job).delete(streaming::delete_streaming_job),
        )
        .route(
            "/api/streaming/jobs/{id}/logs",
            get(streaming::get_streaming_job_logs),
        )
        .route(
            "/api/streaming/jobs/{id}/restart",
            post(streaming::restart_streaming_job),
        )
        // Dagster routes
        .route("/dagster/assets", get(dagster::list_assets))
        .route("/dagster/asset-nodes", get(dagster::list_asset_nodes))
        .route("/dagster/asset-nodes/{*path}", get(dagster::get_asset_node))
        .route(
            "/dagster/asset-status/{*path}",
            get(dagster::get_asset_status),
        )
        .route(
            "/dagster/materialize/{*path}",
            post(dagster::materialize_asset),
        )
        .route(
            "/dagster/materialize-many",
            post(dagster::materialize_many_assets),
        )
        .route(
            "/dagster/runs",
            get(dagster::list_runs).post(dagster::launch_run),
        )
        .route(
            "/dagster/runs/{run_id}",
            get(dagster::get_run).delete(dagster::terminate_run),
        )
        .route(
            "/dagster/runs/{run_id}/events",
            get(dagster::get_run_events),
        )
        .route("/dagster/jobs", get(dagster::list_jobs))
        .route("/dagster/schedules", get(dagster::list_schedules))
        .route(
            "/dagster/schedule-assets",
            get(dagster::list_schedule_asset_selections),
        )
        .route(
            "/dagster/schedule-assets/{name}",
            get(dagster::get_schedule_asset_selection),
        )
        .route(
            "/dagster/schedules/{name}/ticks",
            get(dagster::get_schedule_tick_history),
        )
        // Unity Catalog routes
        .route(
            "/uc/catalogs",
            get(uc::list_catalogs).post(uc::create_catalog),
        )
        .route(
            "/uc/catalogs/{name}",
            get(uc::get_catalog)
                .patch(uc::update_catalog)
                .delete(uc::delete_catalog),
        )
        .route("/uc/schemas", get(uc::list_schemas).post(uc::create_schema))
        .route(
            "/uc/schemas/{full_name}",
            get(uc::get_schema)
                .patch(uc::update_schema)
                .delete(uc::delete_schema),
        )
        .route("/uc/tables", get(uc::list_tables).post(uc::create_table))
        .route(
            "/uc/tables/{full_name}",
            get(uc::get_table).delete(uc::delete_table),
        )
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr = "0.0.0.0:6000";
    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
