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
    duckdb_server_uri: String,
}

impl K8sQueryService {
    pub fn new(duckdb_server_uri: String) -> Self {
        Self { duckdb_server_uri }
    }

    pub async fn run_query(&self, req: QueryRequest) -> Result<QueryResponse, AppError> {
        let client = duckdb::client().await?;
        let job_name = duckdb::create_query_job(&client, &req.sql, req.id_token.as_deref()).await?;
        let result = duckdb::wait_for_completion(&client, &job_name).await;
        let _ = duckdb::delete_query_job(&client, &job_name).await;
        duckdb::parse_output(&result?)
    }

    pub async fn create_session(&self) -> Result<Value, AppError> {
        Ok(json!({ "session_id": default_session_id(), "uri": self.duckdb_server_uri }))
    }

    pub fn list_sessions(&self) -> Value {
        json!({
            "sessions": [{
                "session_id": default_session_id(),
                "uri": self.duckdb_server_uri
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

        self.run_query(req).await
    }
}

fn default_session_id() -> &'static str {
    "default"
}
