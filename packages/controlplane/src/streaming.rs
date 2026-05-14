use std::time::Duration;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use k8s_openapi::api::core::v1::Pod;
use kube::api::{ApiResource, DeleteParams, DynamicObject, LogParams, PostParams};
use kube::{Api, Client};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::AppState;
use crate::error::AppError;

const DEFAULT_NAMESPACE: &str = "spark";

fn is_unique_violation(e: &sqlx::Error) -> bool {
    matches!(
        e,
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505")
    )
}

fn is_k8s_already_exists(e: &kube::Error) -> bool {
    matches!(
        e,
        kube::Error::Api(err) if err.code == 409
    )
}
const DEFAULT_SPARK_VERSION: &str = "4.1.1";
const DEFAULT_DRIVER_MEMORY: &str = "512m";
const DEFAULT_EXECUTOR_MEMORY: &str = "512m";

fn spark_app_resource() -> ApiResource {
    ApiResource {
        group: "sparkoperator.k8s.io".into(),
        version: "v1beta2".into(),
        api_version: "sparkoperator.k8s.io/v1beta2".into(),
        kind: "SparkApplication".into(),
        plural: "sparkapplications".into(),
    }
}

// --- DB model ---

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

// --- K8s status ---

#[derive(Debug, Serialize)]
pub struct K8sStatus {
    pub state: String,
    pub driver_pod: Option<String>,
    pub spark_ui_url: Option<String>,
}

// --- Request/Response types ---

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

// --- K8s helpers ---

async fn get_k8s_status(client: &Client, name: &str, namespace: &str) -> Option<K8sStatus> {
    let ar = spark_app_resource();
    let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), namespace, &ar);
    let obj = api.get(name).await.ok()?;
    let status = obj.data.get("status")?;

    let state = status
        .get("applicationState")
        .and_then(|s| s.get("state"))
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN")
        .to_string();

    let driver_pod = status
        .get("driverInfo")
        .and_then(|d| d.get("podName"))
        .and_then(|p| p.as_str())
        .map(String::from);

    let spark_ui_url = status
        .get("driverInfo")
        .and_then(|d| d.get("webUIAddress"))
        .and_then(|u| u.as_str())
        .map(String::from);

    Some(K8sStatus {
        state,
        driver_pod,
        spark_ui_url,
    })
}

fn build_spark_application(job: &StreamingJob) -> Value {
    // S3A defaults; user spark_conf overrides on top
    let mut spark_conf = json!({
        "spark.hadoop.fs.s3a.impl": "org.apache.hadoop.fs.s3a.S3AFileSystem",
        "spark.hadoop.fs.s3a.endpoint": "http://rustfs-svc.rustfs.svc.cluster.local:9000",
        "spark.hadoop.fs.s3a.path.style.access": "true",
        "spark.hadoop.fs.s3a.access.key": "rustfsadmin",
        "spark.hadoop.fs.s3a.secret.key": "rustfsadmin",
        "spark.hadoop.fs.s3a.connection.ssl.enabled": "false",
        "spark.hadoop.fs.s3a.aws.credentials.provider": "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider",
        "spark.sql.extensions": "io.delta.sql.DeltaSparkSessionExtension",
        "spark.sql.catalog.spark_catalog": "org.apache.spark.sql.delta.catalog.DeltaCatalog"
    });
    if let (Some(base), Some(overrides)) = (spark_conf.as_object_mut(), job.spark_conf.as_object())
    {
        base.extend(overrides.clone());
    }

    json!({
        "apiVersion": "sparkoperator.k8s.io/v1beta2",
        "kind": "SparkApplication",
        "metadata": {
            "name": job.name,
            "namespace": job.namespace,
            "labels": {
                "app.kubernetes.io/managed-by": "mizumi",
                "mizumi.io/job-id": job.id.to_string(),
                "mizumi.io/streaming": "true"
            }
        },
        "spec": {
            "type": "Python",
            "pythonVersion": "3",
            "mode": "cluster",
            "image": job.image,
            "imagePullPolicy": "IfNotPresent",
            "mainApplicationFile": job.main_application_file,
            "sparkVersion": job.spark_version,
            "restartPolicy": {
                "type": "Always",
                "onFailureRetries": 3,
                "onFailureRetryInterval": 10,
                "onSubmissionFailureRetries": 5,
                "onSubmissionFailureRetryInterval": 20
            },
            "sparkConf": spark_conf,
            "driver": {
                "serviceAccount": "spark-operator-spark",
                "cores": job.driver_cores,
                "memory": job.driver_memory,
                "labels": {
                    "app": job.name,
                    "mizumi.io/streaming": "true"
                }
            },
            "executor": {
                "instances": job.executor_instances,
                "cores": job.executor_cores,
                "memory": job.executor_memory,
                "labels": { "app": job.name }
            }
        }
    })
}

async fn apply_spark_application(client: &Client, job: &StreamingJob) -> Result<(), AppError> {
    let manifest = build_spark_application(job);
    let spark_obj: DynamicObject =
        serde_json::from_value(manifest).map_err(|e| AppError::Parse(e.to_string()))?;
    let ar = spark_app_resource();
    let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), &job.namespace, &ar);
    api.create(&PostParams::default(), &spark_obj).await?;
    Ok(())
}

// --- Handlers ---

pub async fn list_streaming_jobs(State(state): State<AppState>) -> impl IntoResponse {
    let jobs = match sqlx::query_as::<_, StreamingJob>(
        "SELECT * FROM streaming_jobs ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => return AppError::Sqlx(e).into_response(),
    };

    let client = Client::try_default().await.ok();
    let mut responses = Vec::with_capacity(jobs.len());
    for job in jobs {
        let k8s_status = match &client {
            Some(c) => get_k8s_status(c, &job.name, &job.namespace).await,
            None => None,
        };
        responses.push(StreamingJobResponse { job, k8s_status });
    }

    Json(json!({ "jobs": responses })).into_response()
}

pub async fn create_streaming_job(
    State(state): State<AppState>,
    Json(req): Json<CreateStreamingJobRequest>,
) -> impl IntoResponse {
    let job = match sqlx::query_as::<_, StreamingJob>(
        r#"
        INSERT INTO streaming_jobs (
            name, namespace, image, main_application_file, spark_version,
            spark_conf, driver_cores, driver_memory, executor_instances,
            executor_cores, executor_memory
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        "#,
    )
    .bind(&req.name)
    .bind(req.namespace.as_deref().unwrap_or(DEFAULT_NAMESPACE))
    .bind(&req.image)
    .bind(&req.main_application_file)
    .bind(
        req.spark_version
            .as_deref()
            .unwrap_or(DEFAULT_SPARK_VERSION),
    )
    .bind(req.spark_conf.as_ref().unwrap_or(&json!({})))
    .bind(req.driver_cores.unwrap_or(1))
    .bind(
        req.driver_memory
            .as_deref()
            .unwrap_or(DEFAULT_DRIVER_MEMORY),
    )
    .bind(req.executor_instances.unwrap_or(1))
    .bind(req.executor_cores.unwrap_or(1))
    .bind(
        req.executor_memory
            .as_deref()
            .unwrap_or(DEFAULT_EXECUTOR_MEMORY),
    )
    .fetch_one(&state.db)
    .await
    {
        Ok(row) => row,
        Err(e) => {
            if is_unique_violation(&e) {
                return AppError::Conflict(format!(
                    "a streaming job named '{}' already exists in namespace '{}'",
                    req.name,
                    req.namespace.as_deref().unwrap_or(DEFAULT_NAMESPACE)
                ))
                .into_response();
            }
            return AppError::Sqlx(e).into_response();
        }
    };

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => {
            // Roll back DB record if K8s client is unavailable
            let _ = sqlx::query("DELETE FROM streaming_jobs WHERE id = $1")
                .bind(job.id)
                .execute(&state.db)
                .await;
            return AppError::Kube(e).into_response();
        }
    };

    if let Err(e) = apply_spark_application(&client, &job).await {
        let _ = sqlx::query("DELETE FROM streaming_jobs WHERE id = $1")
            .bind(job.id)
            .execute(&state.db)
            .await;
        if let AppError::Kube(ref kube_err) = e {
            if is_k8s_already_exists(kube_err) {
                return AppError::Conflict(format!(
                    "SparkApplication '{}' already exists in K8s — delete it first or use the restart endpoint",
                    job.name
                ))
                .into_response();
            }
        }
        return e.into_response();
    }

    tracing::info!(name = %job.name, namespace = %job.namespace, "streaming job created");
    (
        StatusCode::CREATED,
        Json(StreamingJobResponse {
            job,
            k8s_status: None,
        }),
    )
        .into_response()
}

pub async fn get_streaming_job(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let job = match sqlx::query_as::<_, StreamingJob>("SELECT * FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return AppError::NotFound.into_response(),
        Err(e) => return AppError::Sqlx(e).into_response(),
    };

    let k8s_status = match Client::try_default().await {
        Ok(c) => get_k8s_status(&c, &job.name, &job.namespace).await,
        Err(_) => None,
    };

    Json(StreamingJobResponse { job, k8s_status }).into_response()
}

pub async fn delete_streaming_job(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let job = match sqlx::query_as::<_, StreamingJob>("SELECT * FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return AppError::NotFound.into_response(),
        Err(e) => return AppError::Sqlx(e).into_response(),
    };

    if let Ok(client) = Client::try_default().await {
        let ar = spark_app_resource();
        let api: Api<DynamicObject> = Api::namespaced_with(client, &job.namespace, &ar);
        let _ = api.delete(&job.name, &DeleteParams::background()).await;
        tracing::info!(name = %job.name, "SparkApplication deleted");
    }

    if let Err(e) = sqlx::query("DELETE FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        return AppError::Sqlx(e).into_response();
    }

    tracing::info!(name = %job.name, "streaming job record removed");
    StatusCode::NO_CONTENT.into_response()
}

pub async fn get_streaming_job_logs(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let job = match sqlx::query_as::<_, StreamingJob>("SELECT * FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return AppError::NotFound.into_response(),
        Err(e) => return AppError::Sqlx(e).into_response(),
    };

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => return AppError::Kube(e).into_response(),
    };

    let status = match get_k8s_status(&client, &job.name, &job.namespace).await {
        Some(s) => s,
        None => {
            return AppError::QueryFailed("SparkApplication not found in K8s".into())
                .into_response();
        }
    };

    let pod_name = match status.driver_pod {
        Some(p) => p,
        None => return AppError::QueryFailed("driver pod not yet assigned".into()).into_response(),
    };

    let pods: Api<Pod> = Api::namespaced(client, &job.namespace);
    let logs = match pods
        .logs(
            &pod_name,
            &LogParams {
                tail_lines: Some(500),
                ..Default::default()
            },
        )
        .await
    {
        Ok(l) => l,
        Err(e) => return AppError::Kube(e).into_response(),
    };

    Json(json!({ "pod": pod_name, "logs": logs })).into_response()
}

pub async fn restart_streaming_job(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let job = match sqlx::query_as::<_, StreamingJob>("SELECT * FROM streaming_jobs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return AppError::NotFound.into_response(),
        Err(e) => return AppError::Sqlx(e).into_response(),
    };

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => return AppError::Kube(e).into_response(),
    };

    let ar = spark_app_resource();
    let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), &job.namespace, &ar);

    let _ = api.delete(&job.name, &DeleteParams::background()).await;
    // Give the operator a moment to process the deletion before recreating
    tokio::time::sleep(Duration::from_secs(3)).await;

    if let Err(e) = apply_spark_application(&client, &job).await {
        return e.into_response();
    }

    tracing::info!(name = %job.name, "streaming job restarted");
    Json(json!({ "message": "restarted", "name": job.name })).into_response()
}
