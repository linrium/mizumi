use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};

use crate::{
    domain::entities::semantic_registry::{
        CreateSemanticDefinitionRequest, SemanticCompareQuery, SemanticDefinitionsQuery,
        SemanticGraphQuery, TransitionSemanticStatusRequest,
    },
    infrastructure::{auth::KeycloakClaims, server::AppState},
};

pub async fn list_definitions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SemanticDefinitionsQuery>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .list_definitions(query)
        .await
    {
        Ok(definitions) => Json(serde_json::json!({ "definitions": definitions })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_definition(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Json(req): Json<CreateSemanticDefinitionRequest>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .create_definition(req, &principal_from_claims(&claims))
        .await
    {
        Ok(detail) => (StatusCode::CREATED, Json(detail)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_version(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Path((namespace, name)): Path<(String, String)>,
    Json(mut req): Json<CreateSemanticDefinitionRequest>,
) -> impl IntoResponse {
    req.namespace = namespace;
    req.name = name;
    match state
        .semantic_registry_service
        .create_definition(req, &principal_from_claims(&claims))
        .await
    {
        Ok(detail) => (StatusCode::CREATED, Json(detail)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_versions(
    State(state): State<Arc<AppState>>,
    Path((namespace, name)): Path<(String, String)>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .list_versions(&namespace, &name)
        .await
    {
        Ok(versions) => Json(serde_json::json!({ "versions": versions })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_definition_version(
    State(state): State<Arc<AppState>>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .get_detail(&namespace, &name, version)
        .await
    {
        Ok(detail) => Json(detail).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn transition_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
    Json(req): Json<TransitionSemanticStatusRequest>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .transition_status(
            &namespace,
            &name,
            version,
            req,
            &principal_from_claims(&claims),
        )
        .await
    {
        Ok(detail) => Json(detail).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_graph(
    State(state): State<Arc<AppState>>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
    Query(query): Query<SemanticGraphQuery>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .graph(&namespace, &name, version, query.direction, query.depth)
        .await
    {
        Ok(graph) => Json(graph).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn compare_versions(
    State(state): State<Arc<AppState>>,
    Path((namespace, name)): Path<(String, String)>,
    Query(query): Query<SemanticCompareQuery>,
) -> impl IntoResponse {
    match state
        .semantic_registry_service
        .compare(&namespace, &name, query.from, query.to)
        .await
    {
        Ok(compare) => Json(compare).into_response(),
        Err(err) => err.into_response(),
    }
}

fn principal_from_claims(claims: &KeycloakClaims) -> String {
    claims
        .preferred_username
        .clone()
        .or_else(|| claims.email.clone())
        .unwrap_or_else(|| claims.sub.clone())
}
