use std::time::Duration;

use k8s_openapi::api::batch::v1::{Job, JobSpec};
use k8s_openapi::api::core::v1::{Container, EnvVar, Pod, PodSpec, PodTemplateSpec};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    Api, Client,
    api::{DeleteParams, ListParams, LogParams, PostParams},
};
use tokio::time::sleep;
use uuid::Uuid;

use crate::domain::error::AppError;

const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub async fn client() -> Result<Client, AppError> {
    Ok(Client::try_default().await?)
}

pub async fn lint_contract(
    client: &Client,
    namespace: &str,
    image: &str,
    yaml: &str,
    timeout: Duration,
) -> Result<String, AppError> {
    let job_name = format!("datacontract-lint-{}", Uuid::new_v4());
    let jobs: Api<Job> = Api::namespaced(client.clone(), namespace);
    jobs.create(
        &PostParams::default(),
        &build_job(&job_name, namespace, image, yaml),
    )
    .await?;
    let result = wait_for_completion(client, namespace, &job_name, timeout).await;
    let _ = delete_job(client, namespace, &job_name).await;
    result
}

async fn delete_job(client: &Client, namespace: &str, job_name: &str) -> Result<(), AppError> {
    let jobs: Api<Job> = Api::namespaced(client.clone(), namespace);
    let _ = jobs.delete(job_name, &DeleteParams::background()).await?;
    Ok(())
}

fn build_job(name: &str, namespace: &str, image: &str, yaml: &str) -> Job {
    Job {
        metadata: ObjectMeta {
            name: Some(name.to_string()),
            namespace: Some(namespace.to_string()),
            ..Default::default()
        },
        spec: Some(JobSpec {
            backoff_limit: Some(0),
            ttl_seconds_after_finished: Some(60),
            template: PodTemplateSpec {
                spec: Some(PodSpec {
                    restart_policy: Some("Never".to_string()),
                    containers: vec![Container {
                        name: "datacontract-cli".to_string(),
                        image: Some(image.to_string()),
                        image_pull_policy: Some("IfNotPresent".to_string()),
                        command: Some(vec![
                            "/bin/sh".to_string(),
                            "-lc".to_string(),
                            "printf '%s' \"$DATACONTRACT_YAML\" > /tmp/odcs.yaml && datacontract lint /tmp/odcs.yaml".to_string(),
                        ]),
                        env: Some(vec![env("DATACONTRACT_YAML", yaml)]),
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

async fn wait_for_completion(
    client: &Client,
    namespace: &str,
    job_name: &str,
    timeout: Duration,
) -> Result<String, AppError> {
    let jobs: Api<Job> = Api::namespaced(client.clone(), namespace);
    let pods: Api<Pod> = Api::namespaced(client.clone(), namespace);
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(AppError::Timeout);
        }

        let job = jobs.get(job_name).await?;
        let status = job.status.as_ref();

        if status.and_then(|s| s.succeeded).unwrap_or(0) > 0 {
            return get_pod_logs(&pods, job_name).await;
        }

        if status.and_then(|s| s.failed).unwrap_or(0) > 0 {
            let logs = get_pod_logs(&pods, job_name).await.unwrap_or_default();
            return Err(AppError::QueryFailed(logs));
        }

        sleep(POLL_INTERVAL).await;
    }
}

async fn get_pod_logs(pods: &Api<Pod>, job_name: &str) -> Result<String, AppError> {
    let pod_list = pods
        .list(&ListParams::default().labels(&format!("job-name={job_name}")))
        .await?;
    let pod = pod_list
        .items
        .first()
        .ok_or_else(|| AppError::QueryFailed("no pod found for Data Contract CLI job".into()))?;
    let pod_name = pod
        .metadata
        .name
        .as_deref()
        .ok_or_else(|| AppError::QueryFailed("Data Contract CLI pod has no name".into()))?;
    Ok(pods.logs(pod_name, &LogParams::default()).await?)
}

fn env(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}
