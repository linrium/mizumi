use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};

use crate::{
    domain::entities::lineage::{GraphQuery, SearchQuery},
    infrastructure::server::AppState,
};

pub async fn rebuild_lineage(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.lineage_service.rebuild().await {
        Ok(response) => Json(response).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn search_lineage(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    match state
        .lineage_service
        .search(&query.q, query.limit.unwrap_or(20).min(100))
        .await
    {
        Ok(response) => Json(response).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_lineage_graph(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GraphQuery>,
) -> impl IntoResponse {
    match state.lineage_service.graph(query).await {
        Ok(response) => Json(response).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_blast_radius(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GraphQuery>,
) -> impl IntoResponse {
    let Some(root) = query.root else {
        return axum::http::StatusCode::BAD_REQUEST.into_response();
    };

    match state.lineage_service.blast_radius(&root).await {
        Ok(response) => Json(response).into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn get_lineage_node(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match state.lineage_service.node_detail(&token).await {
        Ok(response) => Json(response).into_response(),
        Err(err) => err.into_response(),
    }
}
