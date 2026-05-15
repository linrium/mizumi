use std::sync::Arc;

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
    sessions: Arc<duckdb::SessionStore>,
}

impl K8sQueryService {
    pub fn new(sessions: Arc<duckdb::SessionStore>) -> Self {
        Self { sessions }
    }

    pub fn sessions(&self) -> Arc<duckdb::SessionStore> {
        self.sessions.clone()
    }

    pub async fn run_query(&self, req: QueryRequest) -> Result<QueryResponse, AppError> {
        let client = duckdb::client().await?;
        let job_name =
            duckdb::create_query_job(&client, &req.sql, req.id_token.as_deref()).await?;
        let result = duckdb::wait_for_completion(&client, &job_name).await;
        let _ = duckdb::delete_query_job(&client, &job_name).await;
        duckdb::parse_output(&result?)
    }

    pub async fn create_session(&self) -> Result<Value, AppError> {
        let client = duckdb::client().await?;
        let (session_id, pod_name) = duckdb::create_session(&client, self.sessions()).await?;
        Ok(json!({ "session_id": session_id, "pod": pod_name }))
    }

    pub fn list_sessions(&self) -> Value {
        let sessions: Vec<Value> = self
            .sessions
            .list()
            .into_iter()
            .map(|(id, pod)| json!({ "session_id": id, "pod": pod }))
            .collect();
        json!({ "sessions": sessions })
    }

    pub async fn delete_session(&self, id: &str) -> Result<(), AppError> {
        let pod_name = self.sessions.remove(id).ok_or(AppError::NotFound)?;
        let client = duckdb::client().await?;
        duckdb::delete_session_pod(&client, &pod_name).await?;
        Ok(())
    }

    pub async fn session_query(
        &self,
        id: &str,
        req: QueryRequest,
    ) -> Result<QueryResponse, AppError> {
        let pod_name = self.sessions.get(id).ok_or(AppError::NotFound)?;
        let client = duckdb::client().await?;
        duckdb::session_query(&client, &pod_name, &req.sql, req.id_token.as_deref()).await
    }
}
