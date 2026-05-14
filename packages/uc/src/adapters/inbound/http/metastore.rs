use axum::{extract::State, response::IntoResponse, Json};
use std::sync::Arc;
use crate::{
    adapters::inbound::http::error::AppError,
    infrastructure::server::AppState,
};

pub async fn get_metastore_summary(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let metastore = state.metastore_service.get_metastore().await?;
    Ok(Json(metastore))
}
