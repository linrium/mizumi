use std::time::Duration;

use axum::Json;
use k8s_openapi::api::batch::v1::{Job, JobSpec};
use k8s_openapi::api::core::v1::{Container, EnvVar, Pod, PodSpec, PodTemplateSpec};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    Api, Client,
    api::{DeleteParams, ListParams, LogParams, PostParams},
};
use serde_json::Value;
use tokio::time::sleep;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{QueryRequest, QueryResponse};

const NAMESPACE: &str = "spark";
const DUCKDB_IMAGE: &str = "mizumi-duckdb:1.1.3";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const JOB_TIMEOUT: Duration = Duration::from_secs(120);

pub async fn run_query(Json(req): Json<QueryRequest>) -> Result<Json<QueryResponse>, AppError> {
    let client = Client::try_default().await?;
    let job_name = format!("duckdb-query-{}", Uuid::new_v4());

    let jobs: Api<Job> = Api::namespaced(client.clone(), NAMESPACE);
    jobs.create(&PostParams::default(), &build_job(&job_name, &req.sql))
        .await?;

    tracing::info!(job = %job_name, "job created");

    let result = wait_for_completion(&client, &job_name).await;

    let _ = jobs.delete(&job_name, &DeleteParams::background()).await;

    let logs = result?;
    parse_output(&logs)
}

fn build_job(name: &str, sql: &str) -> Job {
    Job {
        metadata: ObjectMeta {
            name: Some(name.to_string()),
            namespace: Some(NAMESPACE.to_string()),
            ..Default::default()
        },
        spec: Some(JobSpec {
            backoff_limit: Some(0),
            ttl_seconds_after_finished: Some(60),
            template: PodTemplateSpec {
                spec: Some(PodSpec {
                    restart_policy: Some("Never".to_string()),
                    containers: vec![Container {
                        name: "duckdb-query".to_string(),
                        image: Some(DUCKDB_IMAGE.to_string()),
                        image_pull_policy: Some("IfNotPresent".to_string()),
                        command: Some(vec![
                            "python".to_string(),
                            "/opt/duckdb/query_api.py".to_string(),
                        ]),
                        env: Some(vec![
                            env("AWS_DEFAULT_REGION", "us-east-1"),
                            env(
                                "AWS_ENDPOINT_URL",
                                "http://rustfs-svc.rustfs.svc.cluster.local:9000",
                            ),
                            env("AWS_ACCESS_KEY_ID", "rustfsadmin"),
                            env("AWS_SECRET_ACCESS_KEY", "rustfsadmin"),
                            env("DUCKDB_QUERY", sql),
                        ]),
                        ..Default::default()
                    }],
                    ..Default::default()
                }),
                ..Default::default()
            },
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn env(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}

async fn wait_for_completion(client: &Client, job_name: &str) -> Result<String, AppError> {
    let jobs: Api<Job> = Api::namespaced(client.clone(), NAMESPACE);
    let pods: Api<Pod> = Api::namespaced(client.clone(), NAMESPACE);
    let deadline = tokio::time::Instant::now() + JOB_TIMEOUT;

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(AppError::Timeout);
        }

        let job = jobs.get(job_name).await?;
        let status = job.status.as_ref();

        if status.and_then(|s| s.succeeded).unwrap_or(0) > 0 {
            tracing::info!(job = %job_name, "job succeeded");
            return get_pod_logs(&pods, job_name).await;
        }

        if status.and_then(|s| s.failed).unwrap_or(0) > 0 {
            tracing::warn!(job = %job_name, "job failed");
            let logs = get_pod_logs(&pods, job_name).await.unwrap_or_default();
            return Err(AppError::QueryFailed(logs));
        }

        sleep(POLL_INTERVAL).await;
    }
}

async fn get_pod_logs(pods: &Api<Pod>, job_name: &str) -> Result<String, AppError> {
    let lp = ListParams::default().labels(&format!("job-name={}", job_name));
    let pod_list = pods.list(&lp).await?;

    let pod = pod_list
        .items
        .first()
        .ok_or_else(|| AppError::QueryFailed("no pod found for job".into()))?;

    let pod_name = pod
        .metadata
        .name
        .as_deref()
        .ok_or_else(|| AppError::QueryFailed("pod has no name".into()))?;

    let logs = pods.logs(pod_name, &LogParams::default()).await?;
    Ok(logs)
}

fn parse_output(logs: &str) -> Result<Json<QueryResponse>, AppError> {
    let last_line = logs.lines().last().unwrap_or("").trim();
    let output: Value = serde_json::from_str(last_line)
        .map_err(|e| AppError::Parse(format!("{e}: {last_line}")))?;

    if let Some(err) = output.get("error").and_then(|v| v.as_str()) {
        return Err(AppError::QueryFailed(err.to_string()));
    }

    let columns: Vec<String> = output["columns"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();

    let rows: Vec<Vec<Value>> = output["rows"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|row| row.as_array().cloned().unwrap_or_default())
        .collect();

    let row_count = output["row_count"].as_u64().unwrap_or(rows.len() as u64) as usize;

    Ok(Json(QueryResponse {
        columns,
        rows,
        row_count,
    }))
}
