pub mod dagster;
pub mod k8s;
pub mod streaming;
pub mod tests;
pub mod uc;

use std::sync::Arc;

use axum::{
    Router,
    http::StatusCode,
    routing::{any, delete, get, post},
};
use tower_http::cors::CorsLayer;

use crate::infrastructure::server::AppState;

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/livez", get(|| async { StatusCode::OK }))
        .route("/readyz", get(|| async { StatusCode::OK }))
        .route("/api/query", post(k8s::run_query))
        .route("/api/sessions", get(k8s::list_sessions).post(k8s::create_session))
        .route("/api/sessions/{id}", delete(k8s::delete_session))
        .route("/api/sessions/{id}/query", post(k8s::session_query))
        .route(
            "/api/tests/hdbank/payment-events",
            post(tests::publish_hdbank_payment_event),
        )
        .route(
            "/api/tests/hdbank/customer-events",
            post(tests::publish_hdbank_customer_event),
        )
        .route(
            "/api/tests/vietjetair/customer-events",
            post(tests::publish_vietjetair_customer_event),
        )
        .route(
            "/api/tests/vietjetair/flight-events",
            post(tests::publish_vietjetair_flight_event),
        )
        .route(
            "/api/tests/vietjetair/booking-events",
            post(tests::publish_vietjetair_booking_event),
        )
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
        .route("/dagster/assets", get(dagster::list_assets))
        .route("/dagster/asset-nodes", get(dagster::list_asset_nodes))
        .route("/dagster/asset-nodes/{*path}", get(dagster::get_asset_node))
        .route("/dagster/asset-status/{*path}", get(dagster::get_asset_status))
        .route("/dagster/materialize/{*path}", post(dagster::materialize_asset))
        .route("/dagster/materialize-many", post(dagster::materialize_many_assets))
        .route("/dagster/runs", get(dagster::list_runs).post(dagster::launch_run))
        .route(
            "/dagster/runs/{run_id}",
            get(dagster::get_run).delete(dagster::terminate_run),
        )
        .route("/dagster/runs/{run_id}/events", get(dagster::get_run_events))
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
        .route("/uc/{*path}", any(uc::proxy))
        .with_state(state)
        .layer(CorsLayer::permissive())
}
