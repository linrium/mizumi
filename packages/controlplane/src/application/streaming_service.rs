use std::time::Duration;

use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::{kubernetes::spark, postgres::streaming_jobs},
    domain::{
        entities::streaming::{CreateStreamingJobRequest, StreamingJobResponse},
        error::AppError,
    },
};

const DEFAULT_NAMESPACE: &str = "spark";
const DEFAULT_SPARK_VERSION: &str = "4.1.1";
const DEFAULT_DRIVER_MEMORY: &str = "512m";
const DEFAULT_EXECUTOR_MEMORY: &str = "512m";

#[derive(Clone)]
pub struct StreamingJobService {
    db: PgPool,
}

impl StreamingJobService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn list_jobs(&self) -> Result<Vec<StreamingJobResponse>, AppError> {
        let jobs = streaming_jobs::list(&self.db).await?;
        let client = spark::client().await.ok();
        let mut responses = Vec::with_capacity(jobs.len());

        for job in jobs {
            let k8s_status = match &client {
                Some(c) => spark::get_k8s_status(c, &job.name, &job.namespace).await,
                None => None,
            };
            responses.push(StreamingJobResponse { job, k8s_status });
        }

        Ok(responses)
    }

    pub async fn create_job(
        &self,
        req: CreateStreamingJobRequest,
    ) -> Result<StreamingJobResponse, AppError> {
        let job = streaming_jobs::create(
            &self.db,
            &req.name,
            req.namespace.as_deref().unwrap_or(DEFAULT_NAMESPACE),
            &req.image,
            &req.main_application_file,
            req.spark_version
                .as_deref()
                .unwrap_or(DEFAULT_SPARK_VERSION),
            req.spark_conf.as_ref().unwrap_or(&json!({})),
            req.driver_cores.unwrap_or(1),
            req.driver_memory
                .as_deref()
                .unwrap_or(DEFAULT_DRIVER_MEMORY),
            req.executor_instances.unwrap_or(1),
            req.executor_cores.unwrap_or(1),
            req.executor_memory
                .as_deref()
                .unwrap_or(DEFAULT_EXECUTOR_MEMORY),
        )
        .await
        .map_err(|e| {
            if streaming_jobs::is_unique_violation(&e) {
                AppError::Conflict(format!(
                    "a streaming job named '{}' already exists in namespace '{}'",
                    req.name,
                    req.namespace.as_deref().unwrap_or(DEFAULT_NAMESPACE)
                ))
            } else {
                AppError::Sqlx(e)
            }
        })?;

        let client = match spark::client().await {
            Ok(client) => client,
            Err(e) => {
                let _ = streaming_jobs::delete(&self.db, job.id).await;
                return Err(AppError::Kube(e));
            }
        };

        if let Err(e) = spark::apply_spark_application(&client, &job).await {
            let _ = streaming_jobs::delete(&self.db, job.id).await;
            if let AppError::Kube(ref kube_err) = e {
                if spark::is_k8s_already_exists(kube_err) {
                    return Err(AppError::Conflict(format!(
                        "SparkApplication '{}' already exists in K8s — delete it first or use the restart endpoint",
                        job.name
                    )));
                }
            }
            return Err(e);
        }

        tracing::info!(name = %job.name, namespace = %job.namespace, "streaming job created");
        Ok(StreamingJobResponse {
            job,
            k8s_status: None,
        })
    }

    pub async fn get_job(&self, id: Uuid) -> Result<StreamingJobResponse, AppError> {
        let job = streaming_jobs::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;
        let k8s_status = match spark::client().await {
            Ok(c) => spark::get_k8s_status(&c, &job.name, &job.namespace).await,
            Err(_) => None,
        };

        Ok(StreamingJobResponse { job, k8s_status })
    }

    pub async fn delete_job(&self, id: Uuid) -> Result<(), AppError> {
        let job = streaming_jobs::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;

        if let Ok(client) = spark::client().await {
            let _ = spark::delete_spark_application(&client, &job.namespace, &job.name).await;
            tracing::info!(name = %job.name, "SparkApplication deleted");
        }

        streaming_jobs::delete(&self.db, id).await?;
        tracing::info!(name = %job.name, "streaming job record removed");
        Ok(())
    }

    pub async fn get_job_logs(&self, id: Uuid) -> Result<serde_json::Value, AppError> {
        let job = streaming_jobs::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;

        let client = spark::client().await?;
        let status = spark::get_k8s_status(&client, &job.name, &job.namespace)
            .await
            .ok_or_else(|| AppError::QueryFailed("SparkApplication not found in K8s".into()))?;

        let pod_name = status
            .driver_pod
            .ok_or_else(|| AppError::QueryFailed("driver pod not yet assigned".into()))?;
        let logs = spark::driver_logs(&client, &job.namespace, &pod_name).await?;

        Ok(json!({ "pod": pod_name, "logs": logs }))
    }

    pub async fn restart_job(&self, id: Uuid) -> Result<serde_json::Value, AppError> {
        let job = streaming_jobs::get(&self.db, id)
            .await?
            .ok_or(AppError::NotFound)?;

        let client = spark::client().await?;
        let _ = spark::delete_spark_application(&client, &job.namespace, &job.name).await;
        tokio::time::sleep(Duration::from_secs(3)).await;
        spark::apply_spark_application(&client, &job).await?;

        tracing::info!(name = %job.name, "streaming job restarted");
        Ok(json!({ "message": "restarted", "name": job.name }))
    }
}
