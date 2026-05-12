use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use k8s_openapi::api::batch::v1::{Job, JobSpec};
use k8s_openapi::api::core::v1::{Container, EnvVar, Pod, PodSpec, PodTemplateSpec};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    Api, Client,
    api::{AttachParams, DeleteParams, ListParams, LogParams, PostParams},
};
use serde_json::{Value, json};
use tokio::io::AsyncReadExt;
use tokio::time::sleep;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{QueryRequest, QueryResponse};

const NAMESPACE: &str = "spark";
const DUCKDB_IMAGE: &str = "mizumi-duckdb:1.1.3";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const JOB_TIMEOUT: Duration = Duration::from_secs(120);
const SESSION_TIMEOUT: Duration = Duration::from_secs(60);

// ---- One-shot query (existing) ----

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
                        image_pull_policy: Some("Always".to_string()),
                        command: Some(vec![
                            "python".to_string(),
                            "/opt/duckdb/query_api.py".to_string(),
                        ]),
                        env: Some(duckdb_env(Some(sql))),
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
    let lp = ListParams::default().labels(&format!("job-name={job_name}"));
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
    Ok(pods.logs(pod_name, &LogParams::default()).await?)
}

// ---- Session management ----

pub struct SessionStore(Mutex<HashMap<String, String>>); // session_id -> pod_name

pub fn new_session_store() -> Arc<SessionStore> {
    Arc::new(SessionStore(Mutex::new(HashMap::new())))
}

fn duckdb_env(sql: Option<&str>) -> Vec<EnvVar> {
    let mut vars = vec![
        env("AWS_DEFAULT_REGION", "us-east-1"),
        env(
            "AWS_ENDPOINT_URL",
            "http://rustfs-svc.rustfs.svc.cluster.local:9000",
        ),
        env("AWS_ACCESS_KEY_ID", "rustfsadmin"),
        env("AWS_SECRET_ACCESS_KEY", "rustfsadmin"),
    ];
    if let Some(sql) = sql {
        vars.push(env("DUCKDB_QUERY", sql));
    }
    vars
}

fn env(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}

async fn spawn_session_pod(client: &Client, pod_name: &str) -> Result<(), AppError> {
    let pods: Api<Pod> = Api::namespaced(client.clone(), NAMESPACE);
    let pod = Pod {
        metadata: ObjectMeta {
            name: Some(pod_name.to_string()),
            namespace: Some(NAMESPACE.to_string()),
            ..Default::default()
        },
        spec: Some(PodSpec {
            restart_policy: Some("Never".to_string()),
            containers: vec![Container {
                name: "duckdb".to_string(),
                image: Some(DUCKDB_IMAGE.to_string()),
                image_pull_policy: Some("Always".to_string()),
                // Keep the pod alive; queries are sent via exec
                command: Some(vec![
                    "tail".to_string(),
                    "-f".to_string(),
                    "/dev/null".to_string(),
                ]),
                env: Some(duckdb_env(None)),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    };
    pods.create(&PostParams::default(), &pod).await?;
    Ok(())
}

async fn wait_for_pod_running(client: &Client, pod_name: &str) -> Result<(), AppError> {
    let pods: Api<Pod> = Api::namespaced(client.clone(), NAMESPACE);
    let deadline = tokio::time::Instant::now() + SESSION_TIMEOUT;
    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(AppError::Timeout);
        }
        let pod = pods.get(pod_name).await?;
        match pod.status.as_ref().and_then(|s| s.phase.as_deref()) {
            Some("Running") => return Ok(()),
            Some("Failed") | Some("Succeeded") => {
                return Err(AppError::QueryFailed("pod terminated unexpectedly".into()));
            }
            _ => {}
        }
        sleep(POLL_INTERVAL).await;
    }
}

pub async fn create_session(State(store): State<Arc<SessionStore>>) -> impl IntoResponse {
    let session_id = Uuid::new_v4().to_string();
    let pod_name = format!("duckdb-session-{session_id}");

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => return AppError::from(e).into_response(),
    };

    if let Err(e) = spawn_session_pod(&client, &pod_name).await {
        return e.into_response();
    }

    if let Err(e) = wait_for_pod_running(&client, &pod_name).await {
        let pods: Api<Pod> = Api::namespaced(client, NAMESPACE);
        let _ = pods.delete(&pod_name, &DeleteParams::background()).await;
        return e.into_response();
    }

    store
        .0
        .lock()
        .unwrap()
        .insert(session_id.clone(), pod_name.clone());
    tracing::info!(session_id = %session_id, pod = %pod_name, "session created");

    (
        StatusCode::CREATED,
        Json(json!({ "session_id": session_id, "pod": pod_name })),
    )
        .into_response()
}

pub async fn list_sessions(State(store): State<Arc<SessionStore>>) -> impl IntoResponse {
    let sessions: Vec<Value> = store
        .0
        .lock()
        .unwrap()
        .iter()
        .map(|(id, pod)| json!({ "session_id": id, "pod": pod }))
        .collect();
    Json(json!({ "sessions": sessions }))
}

pub async fn delete_session(
    State(store): State<Arc<SessionStore>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pod_name = match store.0.lock().unwrap().remove(&id) {
        Some(p) => p,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            )
                .into_response();
        }
    };

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => return AppError::from(e).into_response(),
    };

    let pods: Api<Pod> = Api::namespaced(client, NAMESPACE);
    let _ = pods.delete(&pod_name, &DeleteParams::background()).await;
    tracing::info!(session_id = %id, pod = %pod_name, "session deleted");

    StatusCode::NO_CONTENT.into_response()
}

pub async fn session_query(
    State(store): State<Arc<SessionStore>>,
    Path(id): Path<String>,
    Json(req): Json<QueryRequest>,
) -> impl IntoResponse {
    let pod_name = match store.0.lock().unwrap().get(&id).cloned() {
        Some(p) => p,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            )
                .into_response();
        }
    };

    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => return AppError::from(e).into_response(),
    };

    let pods: Api<Pod> = Api::namespaced(client, NAMESPACE);

    // Pass SQL as $1 so it's never interpolated into the shell command string
    let sql = req.sql.as_str();
    let cmd = [
        "sh",
        "-c",
        "DUCKDB_QUERY=$1 python /opt/duckdb/query_api.py",
        "sh",
        sql,
    ];
    let ap = AttachParams::default()
        .stdout(true)
        .stderr(true)
        .stdin(false);

    let mut proc = match pods.exec(&pod_name, cmd, &ap).await {
        Ok(p) => p,
        Err(e) => return AppError::from(e).into_response(),
    };

    // Read stdout (query results) then stderr (script errors), then wait for exit
    let mut stdout_data = String::new();
    if let Some(mut reader) = proc.stdout() {
        reader.read_to_string(&mut stdout_data).await.ok();
    }

    let mut stderr_data = String::new();
    if let Some(mut reader) = proc.stderr() {
        reader.read_to_string(&mut stderr_data).await.ok();
    }

    let _ = proc.join().await;

    // If stdout is empty, surface stderr as the error
    if stdout_data.trim().is_empty() && !stderr_data.trim().is_empty() {
        return AppError::QueryFailed(stderr_data.trim().to_string()).into_response();
    }

    match parse_output(&stdout_data) {
        Ok(result) => result.into_response(),
        Err(e) => e.into_response(),
    }
}

// ---- Shared output parsing ----

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
