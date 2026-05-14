use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct StreamingJob {
    pub id: Uuid,
    pub name: String,
    pub namespace: String,
    pub image: String,
    pub main_application_file: String,
    pub spark_version: String,
    pub spark_conf: serde_json::Value,
    pub driver_cores: i32,
    pub driver_memory: String,
    pub executor_instances: i32,
    pub executor_cores: i32,
    pub executor_memory: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct K8sStatus {
    pub state: String,
    pub driver_pod: Option<String>,
    pub spark_ui_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateStreamingJobRequest {
    pub name: String,
    pub namespace: Option<String>,
    pub image: String,
    pub main_application_file: String,
    pub spark_version: Option<String>,
    pub spark_conf: Option<serde_json::Value>,
    pub driver_cores: Option<i32>,
    pub driver_memory: Option<String>,
    pub executor_instances: Option<i32>,
    pub executor_cores: Option<i32>,
    pub executor_memory: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StreamingJobResponse {
    #[serde(flatten)]
    pub job: StreamingJob,
    pub k8s_status: Option<K8sStatus>,
}
