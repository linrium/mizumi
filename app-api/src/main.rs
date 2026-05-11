mod dagster;
mod error;
mod k8s;
mod models;
mod streaming;
mod uc;

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{FromRef, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use chrono::{DateTime, Utc};
use rdkafka::{
    ClientConfig,
    producer::{FutureProducer, FutureRecord},
    util::Timeout,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tracing::info;

use error::AppError;
use k8s::SessionStore;

#[derive(Clone)]
pub struct AppState {
    pub sessions: Arc<SessionStore>,
    pub db: PgPool,
    pub kafka_producer: FutureProducer,
    pub kafka_topic: String,
}

// Allows existing k8s handlers that extract State<Arc<SessionStore>> to keep working unchanged.
impl FromRef<AppState> for Arc<SessionStore> {
    fn from_ref(state: &AppState) -> Self {
        state.sessions.clone()
    }
}

#[derive(Debug, Deserialize)]
struct PublishOrderEventRequest {
    order_id: i64,
    customer_id: i64,
    country_code: String,
    status: String,
    amount: f64,
    timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
struct PublishOrderEventResponse {
    topic: String,
    key: String,
    timestamp: DateTime<Utc>,
}

async fn publish_order_event(
    State(state): State<AppState>,
    Json(req): Json<PublishOrderEventRequest>,
) -> Result<(StatusCode, Json<PublishOrderEventResponse>), AppError> {
    let timestamp = req.timestamp.unwrap_or_else(Utc::now);
    let key = req.order_id.to_string();
    let payload = json!({
        "timestamp": timestamp,
        "order_id": req.order_id,
        "customer_id": req.customer_id,
        "country_code": req.country_code,
        "status": req.status,
        "amount": req.amount,
    })
    .to_string();

    state
        .kafka_producer
        .send(
            FutureRecord::to(&state.kafka_topic)
                .key(&key)
                .payload(&payload),
            Timeout::After(Duration::from_secs(10)),
        )
        .await
        .map_err(|(e, _)| AppError::Kafka(e.to_string()))?;

    info!(topic = %state.kafka_topic, key = %key, "streaming event published");

    Ok((
        StatusCode::ACCEPTED,
        Json(PublishOrderEventResponse {
            topic: state.kafka_topic,
            key,
            timestamp,
        }),
    ))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or("postgres://app_api:app_api_password@localhost:5433/app_api".to_string());

    let db = PgPool::connect(&database_url)
        .await
        .expect("failed to connect to postgres");

    let kafka_bootstrap_servers = std::env::var("KAFKA_BOOTSTRAP_SERVERS")
        .unwrap_or("redpanda-svc.redpanda.svc.cluster.local:9092".to_string());
    let kafka_topic = std::env::var("KAFKA_TOPIC").unwrap_or("mizumi-orders".to_string());
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
        kafka_topic,
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
        .route("/api/streaming/events", post(publish_order_event))
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
