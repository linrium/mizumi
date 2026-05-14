use axum::{extract::Request, response::Response};

use crate::adapters::outbound::http::uc::UnityCatalogHttpProxy;

#[derive(Clone)]
pub struct UnityCatalogProxyService {
    proxy: UnityCatalogHttpProxy,
}

impl UnityCatalogProxyService {
    pub fn new(proxy: UnityCatalogHttpProxy) -> Self {
        Self { proxy }
    }
}

impl UnityCatalogProxyService {
    pub async fn proxy(&self, request: Request) -> Response {
        self.proxy.proxy(request).await
    }
}
