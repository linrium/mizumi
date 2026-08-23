use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

use crate::{
    domain::entities::{
        data_contract::{
            CreateDataContractRequest, ImportDataContractFromUcRequest, ValidateDataContractRequest,
        },
        semantic_registry::SemanticDefinitionsQuery,
    },
    infrastructure::{auth::KeycloakClaims, server::AppState},
};

pub async fn list_contracts(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SemanticDefinitionsQuery>,
) -> impl IntoResponse {
    match state.data_contract_service.list_contracts(query).await {
        Ok(contracts) => Json(serde_json::json!({ "contracts": contracts })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_contract(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Json(req): Json<CreateDataContractRequest>,
) -> impl IntoResponse {
    match state
        .data_contract_service
        .create_contract(req, &principal_from_claims(&claims))
        .await
    {
        Ok(detail) => (StatusCode::CREATED, Json(detail)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn import_from_uc(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Json(req): Json<ImportDataContractFromUcRequest>,
) -> impl IntoResponse {
    match state
        .data_contract_service
        .import_from_uc(req, &principal_from_claims(&claims))
        .await
    {
        Ok(detail) => (StatusCode::CREATED, Json(detail)).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn list_contract_versions(
    State(state): State<Arc<AppState>>,
    Path((namespace, name)): Path<(String, String)>,
) -> impl IntoResponse {
    match state
        .data_contract_service
        .list_versions(&namespace, &name)
        .await
    {
        Ok(versions) => Json(serde_json::json!({ "versions": versions })).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_contract_version(
    State(state): State<Arc<AppState>>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
) -> impl IntoResponse {
    match state
        .data_contract_service
        .get_detail(&namespace, &name, version)
        .await
    {
        Ok(detail) => Json(detail).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_contract_yaml(
    State(state): State<Arc<AppState>>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
) -> Response {
    let detail = match state
        .data_contract_service
        .get_detail(&namespace, &name, version)
        .await
    {
        Ok(detail) => detail,
        Err(err) => return err.into_response(),
    };

    match state.data_contract_service.to_yaml(&detail) {
        Ok(yaml) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
            yaml,
        )
            .into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn validate_contract_version(
    State(state): State<Arc<AppState>>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
    Json(req): Json<ValidateDataContractRequest>,
) -> impl IntoResponse {
    match state
        .data_contract_service
        .validate_contract(&namespace, &name, version, req)
        .await
    {
        Ok(validation) => Json(validation).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn activate_contract_version(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<KeycloakClaims>,
    Path((namespace, name, version)): Path<(String, String, i32)>,
) -> impl IntoResponse {
    match state
        .data_contract_service
        .activate_contract(&namespace, &name, version, &principal_from_claims(&claims))
        .await
    {
        Ok(detail) => Json(detail).into_response(),
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
