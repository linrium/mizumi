use serde_json::{Value, json};

use crate::{
    adapters::outbound::kubernetes::duckdb,
    domain::{
        entities::query::{QueryRequest, QueryResponse},
        error::AppError,
    },
};

#[derive(Clone)]
pub struct K8sQueryService {
    duckdb_server_base_url: String,
    http_client: reqwest::Client,
}

impl K8sQueryService {
    pub fn new(duckdb_server_base_url: String) -> Self {
        Self {
            duckdb_server_base_url: duckdb_server_base_url.trim_end_matches('/').to_string(),
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn run_query(&self, req: QueryRequest) -> Result<QueryResponse, AppError> {
        let client = duckdb::client().await?;
        let job_name = duckdb::create_query_job(&client, &req.sql, req.id_token.as_deref()).await?;
        let result = duckdb::wait_for_completion(&client, &job_name).await;
        let _ = duckdb::delete_query_job(&client, &job_name).await;
        duckdb::parse_output(&result?)
    }

    pub async fn create_session(&self) -> Result<Value, AppError> {
        self.ensure_server_ready().await?;
        Ok(json!({ "session_id": default_session_id(), "pod": "duckdb-server" }))
    }

    pub fn list_sessions(&self) -> Value {
        json!({
            "sessions": [{
                "session_id": default_session_id(),
                "pod": "duckdb-server"
            }]
        })
    }

    pub async fn delete_session(&self, id: &str) -> Result<(), AppError> {
        if id != default_session_id() {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub async fn session_query(
        &self,
        id: &str,
        req: QueryRequest,
    ) -> Result<QueryResponse, AppError> {
        if id != default_session_id() {
            return Err(AppError::NotFound);
        }

        let mut body = json!({ "sql": req.sql });
        if let Some(token) = req.id_token {
            body["uc_token"] = Value::String(token);
        }

        let response = self
            .http_client
            .post(format!("{}/query", self.duckdb_server_base_url))
            .json(&body)
            .send()
            .await
            .map_err(|err| AppError::QueryFailed(err.to_string()))?;

        let status = response.status();
        let value = response
            .json::<Value>()
            .await
            .map_err(|err| AppError::Parse(err.to_string()))?;

        if !status.is_success() {
            let message = value
                .get("error")
                .and_then(|inner| inner.as_str())
                .unwrap_or("query failed")
                .to_string();
            return Err(AppError::QueryFailed(message));
        }

        serde_json::from_value(value).map_err(|err| AppError::Parse(err.to_string()))
    }

    async fn ensure_server_ready(&self) -> Result<(), AppError> {
        let response = self
            .http_client
            .get(format!("{}/health", self.duckdb_server_base_url))
            .send()
            .await
            .map_err(|err| AppError::QueryFailed(err.to_string()))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(AppError::QueryFailed(format!(
                "duckdb server health check failed: HTTP {}",
                response.status()
            )))
        }
    }
}

fn default_session_id() -> &'static str {
    "default"
}
