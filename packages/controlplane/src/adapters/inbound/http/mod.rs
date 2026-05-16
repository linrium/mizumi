pub mod dagster;
pub mod k8s;
pub mod permissions;
pub mod streaming;
pub mod teams;
pub mod tests;
pub mod uc;
pub mod users;

use std::sync::Arc;

use axum::{
    Router,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{any, delete, get, post},
};
use tower_http::cors::CorsLayer;

use crate::infrastructure::server::AppState;

async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = extract_bearer(req.headers()).ok_or(StatusCode::UNAUTHORIZED)?;
    // tracing::debug!("valid token {:?}", token);

    let claims = state.keycloak_auth.validate(&token).await.map_err(|e| {
        tracing::debug!("auth rejected: {}", e);
        StatusCode::UNAUTHORIZED
    })?;

    if let Err(e) = state.user_service.ensure_registered(&claims).await {
        tracing::error!("user registration failed: {}", e);
    }

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let auth = headers.get("authorization")?.to_str().ok()?;
    Some(auth.strip_prefix("Bearer ")?.to_string())
}

pub fn create_router(state: Arc<AppState>) -> Router {
    let protected = Router::new()
        .route("/api/teams", get(teams::list_teams).post(teams::create_team))
        .route("/api/teams/{id}", get(teams::get_team))
        .route(
            "/api/teams/{id}/members",
            get(teams::list_members).post(teams::add_member),
        )
        .route(
            "/api/teams/{id}/members/{user_id}",
            delete(teams::remove_member),
        )
        .route("/api/users", get(users::list_users))
        .route("/api/users/me", get(users::me))
        .route("/api/query", post(k8s::run_query))
        .route(
            "/api/sessions",
            get(k8s::list_sessions).post(k8s::create_session),
        )
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
        .route(
            "/api/permissions/requests",
            get(permissions::list_requests).post(permissions::create_request),
        )
        .route(
            "/api/permissions/requests/bulk-approve",
            post(permissions::bulk_approve),
        )
        .route(
            "/api/permissions/requests/{id}",
            get(permissions::get_request).patch(permissions::update_request_status),
        )
        .route(
            "/api/permissions/policy-templates",
            get(permissions::list_policy_templates),
        )
        .route(
            "/api/permissions/blast-radius",
            get(permissions::list_blast_radius),
        )
        .route(
            "/api/permissions/grants",
            get(permissions::list_time_bound_grants),
        )
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
        .route("/uc/{*path}", any(uc::proxy))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    Router::new()
        .route("/livez", get(|| async { StatusCode::OK }))
        .route("/readyz", get(|| async { StatusCode::OK }))
        .merge(protected)
        .layer(CorsLayer::permissive())
}
