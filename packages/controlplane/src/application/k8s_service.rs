use serde_json::{Value, json};

use crate::{
    adapters::outbound::kubernetes::duckdb,
    application::chronicle_service::ChronicleAuditService,
    domain::{
        entities::query::{QueryRequest, QueryResponse},
        error::AppError,
    },
};

#[derive(Clone)]
pub struct K8sQueryService {
    duckdb_server_uri: String,
    chronicle: ChronicleAuditService,
}

impl K8sQueryService {
    pub fn new(duckdb_server_uri: String, chronicle: ChronicleAuditService) -> Self {
        Self {
            duckdb_server_uri,
            chronicle,
        }
    }

    pub async fn run_query(&self, req: QueryRequest) -> Result<QueryResponse, AppError> {
        let sql = req.sql;
        let id_token = req.id_token;
        let client = match duckdb::client().await {
            Ok(client) => client,
            Err(error) => {
                self.chronicle
                    .record_error(
                        "data.query.failed",
                        &error.to_string(),
                        json!({
                            "engine": "duckdb",
                            "stage": "client",
                            "sql": sql,
                        }),
                    )
                    .await;
                return Err(error);
            }
        };
        let job_name = match duckdb::create_query_job(&client, &sql, id_token.as_deref()).await {
            Ok(job_name) => job_name,
            Err(error) => {
                self.chronicle
                    .record_error(
                        "data.query.failed",
                        &error.to_string(),
                        json!({
                            "engine": "duckdb",
                            "stage": "create_job",
                            "sql": sql,
                        }),
                    )
                    .await;
                return Err(error);
            }
        };
        let result = duckdb::wait_for_completion(&client, &job_name).await;
        let _ = duckdb::delete_query_job(&client, &job_name).await;
        let output = result.and_then(|raw| duckdb::parse_output(&raw));

        match &output {
            Ok(response) => {
                self.chronicle
                    .record(
                        "data.query.completed",
                        json!({
                            "outcome": "success",
                            "engine": "duckdb",
                            "job_name": job_name,
                            "sql": sql,
                            "row_count": response.row_count,
                            "columns": &response.columns,
                        }),
                    )
                    .await;
            }
            Err(error) => {
                self.chronicle
                    .record_error(
                        "data.query.failed",
                        &error.to_string(),
                        json!({
                            "engine": "duckdb",
                            "job_name": job_name,
                            "sql": sql,
                        }),
                    )
                    .await;
            }
        }

        output
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

        let sql = req.sql.clone();
        let response = self.run_query(req).await;
        if let Ok(response) = &response {
            self.chronicle
                .record(
                    "data.session_query.completed",
                    json!({
                        "outcome": "success",
                        "engine": "duckdb",
                        "session_id": id,
                        "sql": sql,
                        "row_count": response.row_count,
                    }),
                )
                .await;
        }
        response
    }
}

fn default_session_id() -> &'static str {
    "default"
}
