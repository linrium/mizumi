use axum::{extract::Request, response::Response};

use crate::uc;

#[derive(Clone, Default)]
pub struct UnityCatalogProxyService;

impl UnityCatalogProxyService {
    pub async fn proxy(&self, request: Request) -> Response {
        uc::proxy(request).await
    }
}
