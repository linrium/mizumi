set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

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
spark_image := "mizumi-spark-rustfs:3.5.8"

deploy: rustfs-deploy spark-deploy

destroy: spark-destroy rustfs-destroy

forward:
    trap 'kill 0 2>/dev/null || true' EXIT INT TERM
    just rustfs-forward &
    just spark-forward &
    echo "RustFS console: http://127.0.0.1:9001"
    echo "RustFS S3 API:   http://127.0.0.1:9000"
    echo "Spark UI:        http://127.0.0.1:4040"
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

spark-deploy: spark-operator-deploy spark-image-build spark-seed-data spark-job-deploy

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

spark-forward:
    ui_service=$(kubectl get sparkapplication {{spark_app_name}} -n {{spark_namespace}} -o jsonpath='{.status.driverInfo.webUIServiceName}'); \
    test -n "$ui_service"; \
    kubectl port-forward -n {{spark_namespace}} service/$ui_service 4040:4040

spark-destroy:
    kubectl delete sparkapplication {{spark_app_name}} -n {{spark_namespace}} --ignore-not-found
    kubectl delete job rustfs-seed-bronze -n {{spark_namespace}} --ignore-not-found
    helm uninstall {{spark_operator_release}} --namespace {{spark_operator_namespace}} || true
    kubectl delete namespace {{spark_namespace}} --ignore-not-found --wait=false
    kubectl delete namespace {{spark_operator_namespace}} --ignore-not-found --wait=false
