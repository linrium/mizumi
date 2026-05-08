set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

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

deploy: rustfs-deploy spark-deploy dagster-deploy

destroy: spark-destroy rustfs-destroy dagster-destroy

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
    echo "RustFS console:  http://127.0.0.1:9001"
    echo "RustFS S3 API:   http://127.0.0.1:9000"
    echo "Dagster UI:      http://127.0.0.1:8080"
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

dagster-deploy: dagster-helm-repo dagster-image-build
    kubectl wait --for=delete namespace/{{dagster_namespace}} --timeout=120s 2>/dev/null || true
    helm upgrade --install {{dagster_release}} {{dagster_chart}} \
      --namespace {{dagster_namespace}} \
      --create-namespace \
      --version {{dagster_chart_version}} \
      --values {{dagster_values}}
    kubectl wait --namespace {{dagster_namespace}} --for=condition=Available deployment --all --timeout=300s
    kubectl get pods -n {{dagster_namespace}}

dagster-forward:
    pod=$(kubectl get pods --namespace {{dagster_namespace}} \
      --field-selector=status.phase=Running \
      -l "app.kubernetes.io/name=dagster,app.kubernetes.io/instance=dagster,component=dagster-webserver" \
      -o jsonpath="{.items[0].metadata.name}"); \
    test -n "$pod"; \
    kubectl --namespace {{dagster_namespace}} port-forward "$pod" 8080:80

dagster-destroy:
    helm uninstall {{dagster_release}} --namespace {{dagster_namespace}} || true
    kubectl delete namespace {{dagster_namespace}} --ignore-not-found --wait=false

unitycatalog-image-build:
    docker build -t {{unitycatalog_image}} packages/unitycatalog

unitycatalog-ui-image-build:
    docker build \
      --build-arg PROXY_HOST=unitycatalog-svc \
      -t {{unitycatalog_ui_image}} \
      "https://github.com/unitycatalog/unitycatalog.git#v0.4.0:ui"

unitycatalog-deploy: unitycatalog-image-build unitycatalog-ui-image-build
    kubectl create namespace {{unitycatalog_namespace}} 2>/dev/null || true
    kubectl apply -f infra/k8s/unitycatalog/postgres.yaml
    kubectl rollout status statefulset/unitycatalog-postgres -n {{unitycatalog_namespace}} --timeout=120s
    kubectl apply -f infra/k8s/unitycatalog/server.yaml
    kubectl apply -f infra/k8s/unitycatalog/ui.yaml
    kubectl wait --for=condition=Available deployment/unitycatalog -n {{unitycatalog_namespace}} --timeout=180s
    kubectl wait --for=condition=Available deployment/unitycatalog-ui -n {{unitycatalog_namespace}} --timeout=300s
    kubectl get pods,svc -n {{unitycatalog_namespace}}

unitycatalog-forward:
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-svc 8082:8080

unitycatalog-ui-forward:
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-ui-svc 3001:3000

unitycatalog-destroy:
    kubectl delete -f infra/k8s/unitycatalog/ --ignore-not-found || true
    kubectl delete namespace {{unitycatalog_namespace}} --ignore-not-found --wait=false
