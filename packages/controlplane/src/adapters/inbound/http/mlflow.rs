use std::sync::Arc;

use axum::{
    extract::{Request, State},
    response::Response,
};

use crate::infrastructure::server::AppState;

pub async fn proxy(State(state): State<Arc<AppState>>, request: Request) -> Response {
    state.mlflow_service.proxy(request).await
}
