pub mod chat_threads;
pub mod dagster;
pub mod data_contracts;
pub mod k8s;
pub mod lineage;
pub mod mlflow;
pub mod permissions;
pub mod semantic_registry;
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
    routing::{any, delete, get, patch, post},
};
use tower_http::cors::CorsLayer;

use crate::infrastructure::{server::AppState, telemetry};

async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    use crate::infrastructure::auth::{KeycloakClaims, RealmAccess};

    let token = extract_bearer(req.headers()).ok_or(StatusCode::UNAUTHORIZED)?;

    if !state.bypass_token.is_empty() && token == state.bypass_token {
        let claims = KeycloakClaims {
            sub: "bypass".to_string(),
            email: Some("bypass@internal".to_string()),
            preferred_username: Some("bypass".to_string()),
            name: Some("Bypass".to_string()),
            realm_access: Some(RealmAccess {
                roles: vec!["admin".to_string()],
            }),
        };
        req.extensions_mut().insert(claims);
        return Ok(next.run(req).await);
    }

    let claims = state.keycloak_auth.validate(&token).await.map_err(|e| {
        tracing::debug!("auth rejected: {}", e);
        StatusCode::UNAUTHORIZED
    })?;

    if let Err(e) = state.user_service.ensure_registered(&claims).await {
        tracing::error!("user registration failed: {}", e);
        return Err(StatusCode::SERVICE_UNAVAILABLE);
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
        .route(
            "/api/chat/threads",
            get(chat_threads::list_threads).post(chat_threads::create_thread),
        )
        .route(
            "/api/chat/threads/{id}",
            get(chat_threads::get_thread)
                .patch(chat_threads::update_thread)
                .delete(chat_threads::delete_thread),
        )
        .route(
            "/api/teams",
            get(teams::list_teams).post(teams::create_team),
        )
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
        .route("/api/users/me/teams", get(users::my_teams))
        .route("/api/query", post(k8s::run_query))
        .route(
            "/api/sessions",
            get(k8s::list_sessions).post(k8s::create_session),
        )
        .route("/api/sessions/{id}", delete(k8s::delete_session))
        .route("/api/sessions/{id}/query", post(k8s::session_query))
        .route(
            "/api/tests/hdbank/customers/batch",
            post(tests::publish_hdbank_customer_events),
        )
        .route(
            "/api/tests/hdbank/banking-transactions/batch",
            post(tests::publish_hdbank_banking_transaction_events),
        )
        .route(
            "/api/tests/vietjetair/customers/batch",
            post(tests::publish_vietjetair_customer_events),
        )
        .route(
            "/api/tests/vietjetair/flight-tickets/batch",
            post(tests::publish_vietjetair_flight_ticket_events),
        )
        .route(
            "/api/tests/vietjetair/flight-incidents/batch",
            post(tests::publish_vietjetair_flight_incident_events),
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
            "/api/permissions/requests/{id}/blast-radius",
            get(permissions::get_blast_radius),
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
        .route(
            "/api/permissions/grants/{id}",
            get(permissions::get_time_bound_grant),
        )
        .route(
            "/api/permissions/grants/{id}/revoke",
            post(permissions::revoke_grant),
        )
        .route(
            "/api/permissions/grants/{id}/renew",
            post(permissions::admin_renew_grant),
        )
        .route("/api/lineage/rebuild", post(lineage::rebuild_lineage))
        .route("/api/lineage/search", get(lineage::search_lineage))
        .route("/api/lineage/nodes/{token}", get(lineage::get_lineage_node))
        .route("/api/lineage/graph", get(lineage::get_lineage_graph))
        .route("/api/lineage/blast-radius", get(lineage::get_blast_radius))
        .route(
            "/api/semantic-registry/definitions",
            get(semantic_registry::list_definitions).post(semantic_registry::create_definition),
        )
        .route(
            "/api/semantic-registry/definitions/{namespace}/{name}",
            get(semantic_registry::list_versions),
        )
        .route(
            "/api/semantic-registry/definitions/{namespace}/{name}/versions",
            post(semantic_registry::create_version),
        )
        .route(
            "/api/semantic-registry/definitions/{namespace}/{name}/versions/{version}",
            get(semantic_registry::get_definition_version),
        )
        .route(
            "/api/semantic-registry/definitions/{namespace}/{name}/versions/{version}/status",
            patch(semantic_registry::transition_status),
        )
        .route(
            "/api/semantic-registry/definitions/{namespace}/{name}/versions/{version}/graph",
            get(semantic_registry::get_graph),
        )
        .route(
            "/api/semantic-registry/definitions/{namespace}/{name}/compare",
            get(semantic_registry::compare_versions),
        )
        .route(
            "/api/data-contracts",
            get(data_contracts::list_contracts).post(data_contracts::create_contract),
        )
        .route(
            "/api/data-contracts/import-from-uc",
            post(data_contracts::import_from_uc),
        )
        .route(
            "/api/data-contracts/{namespace}/{name}/versions",
            get(data_contracts::list_contract_versions),
        )
        .route(
            "/api/data-contracts/{namespace}/{name}/versions/{version}",
            get(data_contracts::get_contract_version),
        )
        .route(
            "/api/data-contracts/{namespace}/{name}/versions/{version}/odcs.yaml",
            get(data_contracts::get_contract_yaml),
        )
        .route(
            "/api/data-contracts/{namespace}/{name}/versions/{version}/validate",
            post(data_contracts::validate_contract_version),
        )
        .route(
            "/api/data-contracts/{namespace}/{name}/versions/{version}/activate",
            post(data_contracts::activate_contract_version),
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
        .route("/mlflow/{*path}", any(mlflow::proxy))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    telemetry::layer_router(
        Router::new()
            .route("/livez", get(|| async { StatusCode::OK }))
            .route("/readyz", get(|| async { StatusCode::OK }))
            .merge(protected),
    )
    .layer(CorsLayer::permissive())
}
