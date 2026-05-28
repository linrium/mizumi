use axum::{extract::Request, response::Response};

use crate::adapters::outbound::http::mlflow::MlflowHttpProxy;

#[derive(Clone)]
pub struct MlflowProxyService {
    proxy: MlflowHttpProxy,
}

impl MlflowProxyService {
    pub fn new(proxy: MlflowHttpProxy) -> Self {
        Self { proxy }
    }

    pub async fn proxy(&self, request: Request) -> Response {
        self.proxy.proxy(request).await
    }
}
