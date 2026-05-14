use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use k8s_openapi::api::batch::v1::{Job, JobSpec};
use k8s_openapi::api::core::v1::{Container, EnvVar, Pod, PodSpec, PodTemplateSpec};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    Api, Client,
    api::{AttachParams, DeleteParams, ListParams, LogParams, PostParams},
};
use serde_json::Value;
use tokio::{io::AsyncReadExt, time::sleep};
use uuid::Uuid;

use crate::domain::{
    entities::query::QueryResponse,
    error::AppError,
};

const NAMESPACE: &str = "spark";
const DUCKDB_IMAGE: &str = "mizumi-duckdb:1.1.3";
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const JOB_TIMEOUT: Duration = Duration::from_secs(120);
const SESSION_TIMEOUT: Duration = Duration::from_secs(60);

pub struct SessionStore(Mutex<HashMap<String, String>>);

impl SessionStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self(Mutex::new(HashMap::new())))
    }

    pub fn insert(&self, session_id: String, pod_name: String) {
        self.0.lock().unwrap().insert(session_id, pod_name);
    }

    pub fn get(&self, session_id: &str) -> Option<String> {
        self.0.lock().unwrap().get(session_id).cloned()
    }

    pub fn remove(&self, session_id: &str) -> Option<String> {
        self.0.lock().unwrap().remove(session_id)
    }

    pub fn list(&self) -> Vec<(String, String)> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .map(|(id, pod)| (id.clone(), pod.clone()))
            .collect()
    }
}

pub async fn client() -> Result<Client, AppError> {
    Ok(Client::try_default().await?)
}

pub async fn create_query_job(client: &Client, sql: &str) -> Result<String, AppError> {
    let job_name = format!("duckdb-query-{}", Uuid::new_v4());
    let jobs: Api<Job> = Api::namespaced(client.clone(), NAMESPACE);
    jobs.create(&PostParams::default(), &build_job(&job_name, sql))
        .await?;
    tracing::info!(job = %job_name, "job created");
    Ok(job_name)
}

pub async fn delete_query_job(client: &Client, job_name: &str) -> Result<(), AppError> {
    let jobs: Api<Job> = Api::namespaced(client.clone(), NAMESPACE);
    let _ = jobs.delete(job_name, &DeleteParams::background()).await?;
    Ok(())
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

pub async fn wait_for_completion(client: &Client, job_name: &str) -> Result<String, AppError> {
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

pub async fn create_session(
    client: &Client,
    store: Arc<SessionStore>,
) -> Result<(String, String), AppError> {
    let session_id = Uuid::new_v4().to_string();
    let pod_name = format!("duckdb-session-{session_id}");

    spawn_session_pod(client, &pod_name).await?;
    if let Err(e) = wait_for_pod_running(client, &pod_name).await {
        let pods: Api<Pod> = Api::namespaced(client.clone(), NAMESPACE);
        let _ = pods.delete(&pod_name, &DeleteParams::background()).await;
        return Err(e);
    }

    store.insert(session_id.clone(), pod_name.clone());
    tracing::info!(session_id = %session_id, pod = %pod_name, "session created");
    Ok((session_id, pod_name))
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
                image_pull_policy: Some("IfNotPresent".to_string()),
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

pub async fn delete_session_pod(client: &Client, pod_name: &str) -> Result<(), AppError> {
    let pods: Api<Pod> = Api::namespaced(client.clone(), NAMESPACE);
    let _ = pods.delete(pod_name, &DeleteParams::background()).await;
    Ok(())
}

pub async fn session_query(
    client: &Client,
    pod_name: &str,
    sql: &str,
) -> Result<QueryResponse, AppError> {
    let pods: Api<Pod> = Api::namespaced(client.clone(), NAMESPACE);
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

    let mut proc = pods.exec(pod_name, cmd, &ap).await?;

    let mut stdout_data = String::new();
    if let Some(mut reader) = proc.stdout() {
        reader.read_to_string(&mut stdout_data).await.ok();
    }

    let mut stderr_data = String::new();
    if let Some(mut reader) = proc.stderr() {
        reader.read_to_string(&mut stderr_data).await.ok();
    }

    let _ = proc.join().await;

    if stdout_data.trim().is_empty() && !stderr_data.trim().is_empty() {
        return Err(AppError::QueryFailed(stderr_data.trim().to_string()));
    }

    parse_output(&stdout_data)
}

pub fn parse_output(logs: &str) -> Result<QueryResponse, AppError> {
    let value: Value = serde_json::from_str(logs).map_err(|e| AppError::Parse(e.to_string()))?;
    let columns = value
        .get("columns")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::Parse("missing columns".into()))?
        .iter()
        .map(|v| v.as_str().unwrap_or_default().to_string())
        .collect::<Vec<_>>();
    let rows = value
        .get("rows")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::Parse("missing rows".into()))?
        .iter()
        .map(|row| row.as_array().cloned().unwrap_or_default())
        .collect::<Vec<_>>();
    let row_count = value
        .get("row_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(rows.len() as u64) as usize;

    Ok(QueryResponse {
        columns,
        rows,
        row_count,
    })
}
