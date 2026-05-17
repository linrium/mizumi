use k8s_openapi::api::core::v1::Pod;
use kube::api::{ApiResource, DeleteParams, DynamicObject, LogParams, PostParams};
use kube::{Api, Client};
use serde_json::{Value, json};

use crate::domain::{
    entities::streaming::{K8sStatus, StreamingJob},
    error::AppError,
};

pub async fn client() -> Result<Client, kube::Error> {
    Client::try_default().await
}

pub fn is_k8s_already_exists(e: &kube::Error) -> bool {
    matches!(e, kube::Error::Api(err) if err.code == 409)
}

fn spark_app_resource() -> ApiResource {
    ApiResource {
        group: "sparkoperator.k8s.io".into(),
        version: "v1beta2".into(),
        api_version: "sparkoperator.k8s.io/v1beta2".into(),
        kind: "SparkApplication".into(),
        plural: "sparkapplications".into(),
    }
}

pub async fn get_k8s_status(client: &Client, name: &str, namespace: &str) -> Option<K8sStatus> {
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

pub async fn apply_spark_application(client: &Client, job: &StreamingJob) -> Result<(), AppError> {
    let manifest = build_spark_application(job);
    let spark_obj: DynamicObject =
        serde_json::from_value(manifest).map_err(|e| AppError::Parse(e.to_string()))?;
    let ar = spark_app_resource();
    let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), &job.namespace, &ar);
    api.create(&PostParams::default(), &spark_obj).await?;
    Ok(())
}

pub async fn delete_spark_application(
    client: &Client,
    namespace: &str,
    name: &str,
) -> Result<(), AppError> {
    let ar = spark_app_resource();
    let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), namespace, &ar);
    let _ = api.delete(name, &DeleteParams::background()).await?;
    Ok(())
}

pub async fn driver_logs(
    client: &Client,
    namespace: &str,
    pod_name: &str,
) -> Result<String, AppError> {
    let pods: Api<Pod> = Api::namespaced(client.clone(), namespace);
    Ok(pods
        .logs(
            pod_name,
            &LogParams {
                tail_lines: Some(500),
                ..Default::default()
            },
        )
        .await?)
}

fn build_spark_application(job: &StreamingJob) -> Value {
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
                "coreRequest": "500m",
                "memory": job.driver_memory,
                "labels": {
                    "app": job.name,
                    "mizumi.io/streaming": "true"
                }
            },
            "executor": {
                "instances": job.executor_instances,
                "cores": job.executor_cores,
                "coreRequest": "500m",
                "memory": job.executor_memory,
                "labels": { "app": job.name }
            }
        }
    })
}
