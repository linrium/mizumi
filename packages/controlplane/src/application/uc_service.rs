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

    pub async fn grant_permissions(
        &self,
        scope: &str,
        resource: &str,
        principal: &str,
        privileges: &[String],
    ) -> Result<(), String> {
        self.proxy
            .grant_permissions(scope, resource, principal, privileges)
            .await
    }

    pub async fn revoke_permissions(
        &self,
        scope: &str,
        resource: &str,
        principal: &str,
        privileges: &[String],
    ) -> Result<(), String> {
        self.proxy
            .revoke_permissions(scope, resource, principal, privileges)
            .await
    }

    pub async fn get_table(&self, full_name: &str) -> Result<serde_json::Value, String> {
        self.proxy.get_table(full_name).await
    }
}
