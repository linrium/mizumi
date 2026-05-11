set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

app_ui_namespace := "app-ui"
app_ui_image := "mizumi-app-ui:0.1.0"

unitycatalog_namespace := "unitycatalog"
unitycatalog_image := "mizumi-unitycatalog:v0.4.0"
unitycatalog_ui_image := "mizumi-unitycatalog-ui:v0.4.0"

dagster_namespace := "dagster"
dagster_release := "dagster"
dagster_chart := "dagster/dagster"
dagster_chart_version := "1.13.4"
dagster_values := "infra/k8s/dagster/helm/values.yaml"
dagster_image := "mizumi-dagster:1.13.4"

rustfs_namespace := "rustfs"
rustfs_release := "rustfs"
rustfs_chart := "rustfs/rustfs"
rustfs_chart_version := "0.1.0"
rustfs_values := "infra/k8s/rustfs/helm/values.yaml"

spark_operator_namespace := "spark-operator"
spark_namespace := "spark"
spark_operator_release := "spark-operator"
spark_operator_chart := "spark-operator/spark-operator"
spark_operator_chart_version := "2.5.0"
spark_operator_values := "infra/k8s/spark/helm/values.yaml"
spark_app_name := "rustfs-medallion"
spark_pipeline_job := "rustfs-medallion-pipeline-submit"
spark_pipeline_app := "rustfs-medallion-pipeline"
spark_image := "mizumi-spark-rustfs:4.1.1"
daft_image := "mizumi-daft:0.7.10"
datafusion_image := "mizumi-datafusion:50.1.0"

daft_namespace := "daft"
daft_chart := "oci://ghcr.io/eventual-inc/daft/quickstart"
daft_simple_release := "daft-simple"
daft_distributed_release := "daft-distributed"
daft_simple_values := "infra/k8s/daft/helm/simple-values.yaml"
daft_distributed_values := "infra/k8s/daft/helm/distributed-values.yaml"
daft_simple_script := "infra/k8s/daft/scripts/simple_job.py"
daft_distributed_script := "infra/k8s/daft/scripts/distributed_job.py"

ballista_namespace := "ballista"
ballista_manifests := "infra/k8s/ballista"
datafusion_namespace := "spark"
datafusion_query_job := "datafusion-rustfs-query"
duckdb_image := "mizumi-duckdb:1.1.3"
duckdb_namespace := "spark"
duckdb_query_job := "duckdb-rustfs-query"

deploy: rustfs-deploy unitycatalog-deploy spark-deploy dagster-deploy

destroy: spark-destroy dagster-destroy unitycatalog-destroy rustfs-destroy

forward:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null; wait' EXIT INT TERM
    kubectl port-forward -n {{rustfs_namespace}} svc/rustfs-svc 9000:9000 9001:9001 &
    dagster_pod=$(kubectl get pods --namespace {{dagster_namespace}} \
      --field-selector=status.phase=Running \
      -l "app.kubernetes.io/name=dagster,app.kubernetes.io/instance=dagster,component=dagster-webserver" \
      -o jsonpath="{.items[0].metadata.name}")
    kubectl --namespace {{dagster_namespace}} port-forward "$dagster_pod" 8080:80 &
    spark_state=$(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} \
      -o jsonpath='{.status.applicationState.state}' 2>/dev/null || true)
    if [[ "$spark_state" == "RUNNING" ]]; then
        spark_svc=$(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} \
          -o jsonpath='{.status.driverInfo.webUIServiceName}' 2>/dev/null || true)
        [[ -n "$spark_svc" ]] && kubectl port-forward -n {{spark_namespace}} service/"$spark_svc" 4040:4040 &
        echo "Spark job UI:    http://127.0.0.1:4040"
    fi
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-svc 8082:8080 &
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-ui-svc 3001:3000 &
    if kubectl get deployment/app-ui -n {{app_ui_namespace}} &>/dev/null; then
        kubectl port-forward -n {{app_ui_namespace}} svc/app-ui-svc 3002:3000 &
        echo "App UI:          http://127.0.0.1:3002"
    fi
    echo "RustFS console:  http://127.0.0.1:9001"
    echo "RustFS S3 API:   http://127.0.0.1:9000"
    echo "Dagster UI:      http://127.0.0.1:8080"
    echo "Dagster GraphQL: http://127.0.0.1:8080/graphql"
    echo "UC API:          http://127.0.0.1:8082"
    echo "UC UI:           http://127.0.0.1:3001"
    wait

rustfs-helm-repo:
    helm repo add rustfs https://charts.rustfs.com/ 2>/dev/null || true
    helm repo update rustfs

rustfs-deploy: rustfs-helm-repo
    helm upgrade --install {{rustfs_release}} {{rustfs_chart}} \
      --namespace {{rustfs_namespace}} \
      --create-namespace \
      --version {{rustfs_chart_version}} \
      --values {{rustfs_values}}
    kubectl rollout status deployment/{{rustfs_release}} -n {{rustfs_namespace}} --timeout=180s
    kubectl get pods,svc,pvc -n {{rustfs_namespace}}

rustfs-destroy:
    helm uninstall {{rustfs_release}} --namespace {{rustfs_namespace}} || true
    kubectl delete namespace {{rustfs_namespace}} --ignore-not-found --wait=false

rustfs-forward:
    kubectl port-forward -n {{rustfs_namespace}} svc/rustfs-svc 9000:9000 9001:9001

spark-helm-repo:
    helm repo add spark-operator https://kubeflow.github.io/spark-operator 2>/dev/null || true
    helm repo update spark-operator

spark-deploy: spark-operator-deploy spark-image-build spark-seed-data spark-job-deploy spark-pipeline-deploy

spark-operator-deploy: spark-helm-repo
    kubectl create namespace {{spark_namespace}} 2>/dev/null || true
    helm upgrade --install {{spark_operator_release}} {{spark_operator_chart}} \
      --namespace {{spark_operator_namespace}} \
      --create-namespace \
      --version {{spark_operator_chart_version}} \
      --values {{spark_operator_values}}
    kubectl wait --namespace {{spark_operator_namespace}} --for=condition=Available deployment --all --timeout=180s
    kubectl get pods -n {{spark_operator_namespace}}
    kubectl get serviceaccount -n {{spark_namespace}}

spark-image-build:
    docker build -t {{spark_image}} packages/spark

daft-image-build:
    docker build -t {{daft_image}} -f packages/daft/Dockerfile .

datafusion-image-build:
    docker build -t {{datafusion_image}} -f packages/datafusion/Dockerfile .

spark-seed-data:
    kubectl delete job rustfs-seed-bronze -n {{spark_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/spark/seed-job.yaml
    kubectl wait --for=condition=complete job/rustfs-seed-bronze -n {{spark_namespace}} --timeout=180s
    kubectl logs job/rustfs-seed-bronze -n {{spark_namespace}}

spark-job-deploy:
    kubectl delete sparkapplication {{spark_app_name}} -n {{spark_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/spark/app.yaml
    for attempt in $(seq 1 90); do \
      state=$(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} -o jsonpath='{.status.applicationState.state}' 2>/dev/null || true); \
      if [[ "$state" == "COMPLETED" ]]; then \
        kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}}; \
        kubectl logs -n {{spark_namespace}} $(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} -o jsonpath='{.status.driverInfo.podName}'); \
        exit 0; \
      fi; \
      if [[ "$state" == "FAILED" || "$state" == "SUBMISSION_FAILED" ]]; then \
        kubectl describe sparkapplication {{spark_app_name}} -n {{spark_namespace}}; \
        kubectl logs -n {{spark_namespace}} $(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} -o jsonpath='{.status.driverInfo.podName}' 2>/dev/null || true) || true; \
        exit 1; \
      fi; \
      sleep 5; \
    done; \
    kubectl describe sparkapplication {{spark_app_name}} -n {{spark_namespace}}; \
    exit 1

spark-pipeline-deploy:
    kubectl delete job {{spark_pipeline_job}} -n {{spark_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/spark/pipeline-job.yaml
    kubectl wait --for=condition=complete job/{{spark_pipeline_job}} -n {{spark_namespace}} --timeout=300s
    kubectl logs job/{{spark_pipeline_job}} -n {{spark_namespace}}

spark-forward:
    ui_service=$(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} -o jsonpath='{.status.driverInfo.webUIServiceName}'); \
    test -n "$ui_service"; \
    kubectl port-forward -n {{spark_namespace}} service/$ui_service 4040:4040

spark-pipeline-forward:
    pipeline_pod=$(kubectl get pod -n {{spark_namespace}} -l job-name={{spark_pipeline_job}} -o jsonpath='{.items[0].metadata.name}'); \
    test -n "$pipeline_pod"; \
    kubectl port-forward -n {{spark_namespace}} pod/$pipeline_pod 4041:4040

spark-destroy:
    kubectl delete sparkapplication {{spark_app_name}} -n {{spark_namespace}} --ignore-not-found
    kubectl delete job {{spark_pipeline_job}} -n {{spark_namespace}} --ignore-not-found
    kubectl delete job rustfs-seed-bronze -n {{spark_namespace}} --ignore-not-found
    helm uninstall {{spark_operator_release}} --namespace {{spark_operator_namespace}} || true
    kubectl delete namespace {{spark_namespace}} --ignore-not-found --wait=false
    kubectl delete namespace {{spark_operator_namespace}} --ignore-not-found --wait=false

dagster-helm-repo:
    helm repo add dagster https://dagster-io.github.io/helm 2>/dev/null || true
    helm repo update dagster

dagster-image-build:
    docker build -t {{dagster_image}} -f packages/dagster/Dockerfile .
    if kubectl get deployment/{{dagster_release}}-dagster-user-deployments-mizumi -n {{dagster_namespace}} &>/dev/null; then \
      kubectl rollout restart deployment/{{dagster_release}}-dagster-user-deployments-mizumi -n {{dagster_namespace}}; \
      kubectl rollout status deployment/{{dagster_release}}-dagster-user-deployments-mizumi -n {{dagster_namespace}} --timeout=120s; \
    fi

dagster-deploy: dagster-helm-repo dagster-image-build
    helm upgrade --install {{dagster_release}} {{dagster_chart}} \
      --namespace {{dagster_namespace}} \
      --create-namespace \
      --version {{dagster_chart_version}} \
      --values {{dagster_values}}
    kubectl wait --namespace {{dagster_namespace}} --for=condition=Available deployment --all --timeout=300s
    kubectl get pods -n {{dagster_namespace}}

dagster-forward:
    #!/usr/bin/env bash
    set -euo pipefail
    pod=$(kubectl get pods --namespace {{dagster_namespace}} \
      --field-selector=status.phase=Running \
      -l "app.kubernetes.io/name=dagster,app.kubernetes.io/instance=dagster,component=dagster-webserver" \
      -o jsonpath="{.items[0].metadata.name}")
    test -n "$pod"
    echo "Dagster UI:      http://127.0.0.1:8080"
    echo "Dagster GraphQL: http://127.0.0.1:8080/graphql"
    kubectl --namespace {{dagster_namespace}} port-forward "$pod" 8080:80

dagster-destroy:
    helm uninstall {{dagster_release}} --namespace {{dagster_namespace}} || true
    kubectl delete namespace {{dagster_namespace}} --ignore-not-found --wait=false

unitycatalog-image-build:
    docker build -t {{unitycatalog_image}} packages/unitycatalog
    if kubectl get deployment/unitycatalog -n {{unitycatalog_namespace}} &>/dev/null; then \
      kubectl rollout restart deployment/unitycatalog -n {{unitycatalog_namespace}}; \
      kubectl rollout status deployment/unitycatalog -n {{unitycatalog_namespace}} --timeout=120s; \
    fi

unitycatalog-ui-image-build:
    #!/usr/bin/env bash
    set -euo pipefail
    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" EXIT
    git clone --depth 1 --branch v0.4.0 --filter=blob:none --sparse \
      https://github.com/unitycatalog/unitycatalog.git "$tmpdir"
    git -C "$tmpdir" sparse-checkout set ui
    cp packages/unitycatalog-ui/Dockerfile "$tmpdir/ui/Dockerfile"
    docker build \
      --build-arg PROXY_HOST=unitycatalog-svc \
      -t {{unitycatalog_ui_image}} \
      "$tmpdir/ui"
    if kubectl get deployment/unitycatalog-ui -n {{unitycatalog_namespace}} &>/dev/null; then \
      kubectl rollout restart deployment/unitycatalog-ui -n {{unitycatalog_namespace}}; \
      kubectl rollout status deployment/unitycatalog-ui -n {{unitycatalog_namespace}} --timeout=120s; \
    fi

unitycatalog-deploy: unitycatalog-image-build unitycatalog-ui-image-build
    kubectl create namespace {{unitycatalog_namespace}} 2>/dev/null || true
    kubectl apply -f infra/k8s/unitycatalog/postgres.yaml
    kubectl rollout status statefulset/unitycatalog-postgres -n {{unitycatalog_namespace}} --timeout=120s
    kubectl apply -f infra/k8s/unitycatalog/server.yaml
    kubectl apply -f infra/k8s/unitycatalog/ui.yaml
    kubectl wait --for=condition=Available deployment/unitycatalog -n {{unitycatalog_namespace}} --timeout=180s
    kubectl wait --for=condition=Available deployment/unitycatalog-ui -n {{unitycatalog_namespace}} --timeout=300s
    just unitycatalog-bootstrap
    kubectl get pods,svc -n {{unitycatalog_namespace}}

unitycatalog-bootstrap:
    kubectl delete job unitycatalog-bootstrap -n {{unitycatalog_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/unitycatalog/bootstrap-job.yaml
    kubectl wait --for=condition=complete job/unitycatalog-bootstrap -n {{unitycatalog_namespace}} --timeout=120s
    kubectl logs job/unitycatalog-bootstrap -n {{unitycatalog_namespace}}

unitycatalog-forward:
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-svc 8082:8080

unitycatalog-ui-forward:
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-ui-svc 3001:3000

unitycatalog-destroy:
    kubectl delete -f infra/k8s/unitycatalog/ --ignore-not-found || true
    kubectl delete namespace {{unitycatalog_namespace}} --ignore-not-found --wait=false

daft-simple-deploy:
    kubectl create namespace {{daft_namespace}} 2>/dev/null || true
    helm upgrade --install {{daft_simple_release}} {{daft_chart}} \
      --namespace {{daft_namespace}} \
      --create-namespace \
      --values {{daft_simple_values}} \
      --set-file job.script={{daft_simple_script}}
    just daft-simple-logs

daft-distributed-deploy:
    kubectl create namespace {{daft_namespace}} 2>/dev/null || true
    helm upgrade --install {{daft_distributed_release}} {{daft_chart}} \
      --namespace {{daft_namespace}} \
      --create-namespace \
      --values {{daft_distributed_values}} \
      --set-file job.script={{daft_distributed_script}}
    just daft-distributed-logs

daft-simple-logs:
    #!/usr/bin/env bash
    set -euo pipefail
    job_name="{{daft_simple_release}}-quickstart-job"
    for attempt in $(seq 1 60); do
        pod_name=$(kubectl get pods -n {{daft_namespace}} -l job-name="$job_name" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
        if [[ -n "${pod_name:-}" ]]; then
            break
        fi
        sleep 2
    done
    for attempt in $(seq 1 60); do
        if kubectl logs -n {{daft_namespace}} -f job/"$job_name"; then
            exit 0
        fi
        sleep 2
    done
    kubectl describe job "$job_name" -n {{daft_namespace}}
    kubectl get pods -n {{daft_namespace}} -l job-name="$job_name"
    exit 1

daft-distributed-logs:
    #!/usr/bin/env bash
    set -euo pipefail
    job_name="{{daft_distributed_release}}-quickstart-job"
    for attempt in $(seq 1 60); do
        pod_name=$(kubectl get pods -n {{daft_namespace}} -l job-name="$job_name" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
        if [[ -n "${pod_name:-}" ]]; then
            break
        fi
        sleep 2
    done
    for attempt in $(seq 1 60); do
        if kubectl logs -n {{daft_namespace}} -f job/"$job_name"; then
            exit 0
        fi
        sleep 2
    done
    kubectl describe job "$job_name" -n {{daft_namespace}}
    kubectl get pods -n {{daft_namespace}} -l job-name="$job_name"
    exit 1

daft-distributed-forward:
    kubectl port-forward -n {{daft_namespace}} service/{{daft_distributed_release}}-quickstart-head 8265:8265 3000:3000

daft-simple-destroy:
    helm uninstall {{daft_simple_release}} --namespace {{daft_namespace}} || true

daft-distributed-destroy:
    helm uninstall {{daft_distributed_release}} --namespace {{daft_namespace}} || true

daft-destroy: daft-simple-destroy daft-distributed-destroy
    kubectl delete namespace {{daft_namespace}} --ignore-not-found --wait=false

ballista-deploy:
    kubectl create namespace {{ballista_namespace}} 2>/dev/null || true
    kubectl apply -n {{ballista_namespace}} -f {{ballista_manifests}}/pv.yaml
    kubectl delete -n {{ballista_namespace}} -f {{ballista_manifests}}/cluster.yaml --ignore-not-found
    kubectl apply -n {{ballista_namespace}} -f {{ballista_manifests}}/cluster.yaml
    kubectl rollout status deployment/ballista-scheduler -n {{ballista_namespace}} --timeout=180s
    kubectl rollout status deployment/ballista-executor -n {{ballista_namespace}} --timeout=180s
    kubectl get pods,svc,pvc,pv -n {{ballista_namespace}}

ballista-status:
    kubectl get pods,svc,pvc,pv -n {{ballista_namespace}}

ballista-scheduler-logs:
    kubectl logs -n {{ballista_namespace}} deployment/ballista-scheduler

ballista-executor-logs:
    kubectl logs -n {{ballista_namespace}} deployment/ballista-executor

ballista-forward:
    kubectl port-forward -n {{ballista_namespace}} service/ballista-scheduler 50050:50050

ballista-destroy:
    kubectl delete -n {{ballista_namespace}} -f {{ballista_manifests}}/cluster.yaml --ignore-not-found
    kubectl delete -n {{ballista_namespace}} -f {{ballista_manifests}}/pv.yaml --ignore-not-found
    kubectl delete namespace {{ballista_namespace}} --ignore-not-found --wait=false

datafusion-query: datafusion-image-build
    kubectl delete job {{datafusion_query_job}} -n {{datafusion_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/datafusion/query-job.yaml
    kubectl wait --for=condition=complete job/{{datafusion_query_job}} -n {{datafusion_namespace}} --timeout=180s
    kubectl logs job/{{datafusion_query_job}} -n {{datafusion_namespace}}

datafusion-query-logs:
    kubectl logs job/{{datafusion_query_job}} -n {{datafusion_namespace}}

datafusion-query-destroy:
    kubectl delete job {{datafusion_query_job}} -n {{datafusion_namespace}} --ignore-not-found

duckdb-image-build:
    docker build -t {{duckdb_image}} -f packages/duckdb/Dockerfile .

duckdb-query: duckdb-image-build
    kubectl delete job {{duckdb_query_job}} -n {{duckdb_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/duckdb/query-job.yaml
    kubectl wait --for=condition=complete job/{{duckdb_query_job}} -n {{duckdb_namespace}} --timeout=180s
    kubectl logs job/{{duckdb_query_job}} -n {{duckdb_namespace}}

duckdb-query-logs:
    kubectl logs job/{{duckdb_query_job}} -n {{duckdb_namespace}}

duckdb-query-destroy:
    kubectl delete job {{duckdb_query_job}} -n {{duckdb_namespace}} --ignore-not-found

app-ui-image-build:
    docker build -t {{app_ui_image}} app-ui
    if kubectl get deployment/app-ui -n {{app_ui_namespace}} &>/dev/null; then \
      kubectl rollout restart deployment/app-ui -n {{app_ui_namespace}}; \
      kubectl rollout status deployment/app-ui -n {{app_ui_namespace}} --timeout=120s; \
    fi

app-ui-deploy: app-ui-image-build
    kubectl create namespace {{app_ui_namespace}} 2>/dev/null || true
    kubectl apply -f infra/k8s/app-ui/deployment.yaml
    kubectl wait --for=condition=Available deployment/app-ui -n {{app_ui_namespace}} --timeout=180s
    kubectl get pods,svc -n {{app_ui_namespace}}

app-ui-forward:
    kubectl port-forward -n {{app_ui_namespace}} svc/app-ui-svc 3002:3000

app-ui-destroy:
    kubectl delete -f infra/k8s/app-ui/ --ignore-not-found || true
    kubectl delete namespace {{app_ui_namespace}} --ignore-not-found --wait=false
