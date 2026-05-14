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

keycloak_namespace := "keycloak"
keycloak_manifests := "infra/k8s/keycloak"

spark_operator_namespace := "spark-operator"
spark_namespace := "spark"
spark_operator_release := "spark-operator"
spark_operator_chart := "spark-operator/spark-operator"
spark_operator_chart_version := "2.5.0"
spark_operator_values := "infra/k8s/spark/helm/values.yaml"
spark_image := "mizumi-spark-rustfs:4.1.1"
daft_image := "mizumi-daft:0.7.10"

daft_namespace := "daft"
daft_chart := "oci://ghcr.io/eventual-inc/daft/quickstart"
daft_distributed_release := "daft-distributed"
daft_distributed_values := "infra/k8s/daft/helm/distributed-values.yaml"
daft_distributed_script := "infra/k8s/daft/scripts/distributed_job.py"
daft_simple_release := "daft-simple"
daft_simple_values := "infra/k8s/daft/helm/simple-values.yaml"
daft_simple_script := "infra/k8s/daft/scripts/simple_job.py"

redpanda_namespace := "redpanda"
redpanda_manifests := "infra/k8s/redpanda"
redpanda_default_topic_job := "redpanda-default-topic"

deploy: rustfs-deploy redpanda-deploy keycloak-deploy unitycatalog-deploy spark-deploy dagster-deploy daft-image-build daft-distributed-deploy

destroy: spark-destroy dagster-destroy unitycatalog-destroy keycloak-destroy redpanda-destroy rustfs-destroy daft-destroy

forward:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null; wait' EXIT INT TERM
    kubectl port-forward -n {{rustfs_namespace}} svc/rustfs-svc 9000:9000 9001:9001 &
    kubectl port-forward -n {{redpanda_namespace}} svc/redpanda-svc 19092:19092 9644:9644 &
    kubectl port-forward -n {{redpanda_namespace}} svc/redpanda-console-svc 8081:8080 &
    kubectl port-forward -n {{keycloak_namespace}} svc/keycloak-svc 8083:8080 &
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-svc 8082:8080 &
    kubectl port-forward -n {{unitycatalog_namespace}} svc/unitycatalog-ui-svc 3001:3000 &
    kubectl port-forward -n controlplane svc/controlplane-postgres-svc 5433:5432 &
    kubectl port-forward -n daft svc/daft-ray-cluster-head 8265:8265 &
    echo "RustFS console:   http://127.0.0.1:9001"
    echo "RustFS S3 API:    http://127.0.0.1:9000"
    echo "Redpanda Kafka:   127.0.0.1:19092"
    echo "Redpanda Admin:   http://127.0.0.1:9644"
    echo "Redpanda UI:      http://127.0.0.1:8081"
    echo "Keycloak:         http://127.0.0.1:8083"
    echo "Dagster UI:       http://127.0.0.1:8080"
    echo "Dagster GraphQL:  http://127.0.0.1:8080/graphql"
    echo "UC API:           http://127.0.0.1:8082"
    echo "UC UI:            http://127.0.0.1:3001"
    echo "Controlplane Postgres: localhost:5433"
    echo "Daft UI:          http://127.0.0.1:8265"
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

keycloak-deploy:
    kubectl create namespace {{keycloak_namespace}} 2>/dev/null || true
    kubectl apply -f {{keycloak_manifests}}/postgres.yaml
    kubectl rollout status statefulset/keycloak-postgres -n {{keycloak_namespace}} --timeout=300s
    kubectl apply -f {{keycloak_manifests}}/keycloak.yaml
    kubectl rollout status deployment/keycloak -n {{keycloak_namespace}} --timeout=300s
    just keycloak-bootstrap
    kubectl get pods,svc,secret -n {{keycloak_namespace}}

keycloak-bootstrap:
    kubectl delete job keycloak-bootstrap -n {{keycloak_namespace}} --ignore-not-found
    kubectl apply -f {{keycloak_manifests}}/bootstrap-job.yaml
    kubectl wait --for=condition=complete job/keycloak-bootstrap -n {{keycloak_namespace}} --timeout=180s
    kubectl logs job/keycloak-bootstrap -n {{keycloak_namespace}}

keycloak-destroy:
    helm uninstall keycloak --namespace {{keycloak_namespace}} || true
    kubectl delete -f {{keycloak_manifests}}/ --ignore-not-found || true
    kubectl delete namespace {{keycloak_namespace}} --ignore-not-found --wait=false

redpanda-deploy:
    kubectl create namespace {{redpanda_namespace}} 2>/dev/null || true
    kubectl apply -f {{redpanda_manifests}}/
    kubectl rollout status statefulset/redpanda -n {{redpanda_namespace}} --timeout=180s
    kubectl rollout status deployment/redpanda-console -n {{redpanda_namespace}} --timeout=180s
    just redpanda-topic-bootstrap
    kubectl get pods,svc,pvc -n {{redpanda_namespace}}

redpanda-topic-bootstrap:
    kubectl delete job {{redpanda_default_topic_job}} -n {{redpanda_namespace}} --ignore-not-found
    kubectl apply -f {{redpanda_manifests}}/topic-job.yaml
    kubectl wait --for=condition=complete job/{{redpanda_default_topic_job}} -n {{redpanda_namespace}} --timeout=120s
    kubectl logs job/{{redpanda_default_topic_job}} -n {{redpanda_namespace}}

redpanda-destroy:
    kubectl delete -f {{redpanda_manifests}}/ --ignore-not-found || true
    kubectl delete namespace {{redpanda_namespace}} --ignore-not-found --wait=false

spark-helm-repo:
    helm repo add spark-operator https://kubeflow.github.io/spark-operator 2>/dev/null || true
    helm repo update spark-operator

spark-deploy: spark-operator-deploy spark-image-build

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

spark-destroy:
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
    # kubectl apply -f infra/k8s/unitycatalog/ui.yaml
    kubectl wait --for=condition=Available deployment/unitycatalog -n {{unitycatalog_namespace}} --timeout=180s
    # kubectl wait --for=condition=Available deployment/unitycatalog-ui -n {{unitycatalog_namespace}} --timeout=300s
    just unitycatalog-bootstrap
    kubectl get pods,svc -n {{unitycatalog_namespace}}

unitycatalog-destroy:
    kubectl delete -f infra/k8s/unitycatalog/ --ignore-not-found || true
    kubectl delete namespace {{unitycatalog_namespace}} --ignore-not-found --wait=false

unitycatalog-bootstrap:
    kubectl delete job unitycatalog-bootstrap -n {{unitycatalog_namespace}} --ignore-not-found
    kubectl apply -f infra/k8s/unitycatalog/bootstrap-job.yaml
    kubectl wait --for=condition=complete job/unitycatalog-bootstrap -n {{unitycatalog_namespace}} --timeout=120s
    kubectl logs job/unitycatalog-bootstrap -n {{unitycatalog_namespace}}

jobs-submit-all:
    just jobs-sumit-hdbank-card-payments-bronze-stream
    just jobs-sumit-hdbank-customer-profiles-bronze-stream

jobs-sumit-hdbank-card-payments-bronze-stream:
    curl -fsSL -X POST http://127.0.0.1:6000/api/streaming/jobs \
      -H 'Content-Type: application/json' \
      -d '{"name":"hdbank-stream-raw-card-payment-events-to-bronze","image":"{{spark_image}}","main_application_file":"local:///opt/spark/jobs/hdbank/stream_raw_card_payment_events_to_bronze.py"}' \
      | jq

jobs-delete-hdbank-card-payments-bronze-stream:
    #!/usr/bin/env bash
    set -euo pipefail
    id=$(curl -fsSL http://127.0.0.1:6000/api/streaming/jobs \
      | jq -r '.jobs[] | select(.job.name == "hdbank-stream-raw-card-payment-events-to-bronze") | .job.id')
    [[ -z "$id" ]] && { echo "job not found"; exit 1; }
    curl -fsSL -X DELETE "http://127.0.0.1:6000/api/streaming/jobs/$id" && echo "deleted"

jobs-sumit-hdbank-customer-profiles-bronze-stream:
    curl -fsSL -X POST http://127.0.0.1:6000/api/streaming/jobs \
      -H 'Content-Type: application/json' \
      -d '{"name":"hdbank-stream-raw-customer-profile-events-to-bronze","image":"{{spark_image}}","main_application_file":"local:///opt/spark/jobs/hdbank/stream_raw_customer_profile_events_to_bronze.py"}' \
      | jq

jobs-delete-hdbank-customer-profiles-bronze-stream:
    #!/usr/bin/env bash
    set -euo pipefail
    id=$(curl -fsSL http://127.0.0.1:6000/api/streaming/jobs \
      | jq -r '.jobs[] | select(.job.name == "hdbank-stream-raw-customer-profile-events-to-bronze") | .job.id')
    [[ -z "$id" ]] && { echo "job not found"; exit 1; }
    curl -fsSL -X DELETE "http://127.0.0.1:6000/api/streaming/jobs/$id" && echo "deleted"

controlplane-postgres-deploy:
    kubectl apply -f infra/k8s/controlplane/postgres.yaml
    kubectl wait --for=condition=Ready pod -l app=controlplane-postgres -n controlplane --timeout=120s
    kubectl get pods,svc -n controlplane

controlplane-postgres-destroy:
    kubectl delete -f infra/k8s/controlplane/postgres.yaml --ignore-not-found || true
    kubectl delete namespace controlplane --ignore-not-found --wait=false

daft-distributed-deploy:
    kubectl create namespace {{daft_namespace}} 2>/dev/null || true
    helm upgrade --install {{daft_distributed_release}} {{daft_chart}} \
      --namespace {{daft_namespace}} \
      --create-namespace \
      --values {{daft_distributed_values}}

daft-distributed-deploy-with-job:
    kubectl create namespace {{daft_namespace}} 2>/dev/null || true
    helm upgrade --install {{daft_distributed_release}} {{daft_chart}} \
      --namespace {{daft_namespace}} \
      --create-namespace \
      --values {{daft_distributed_values}} \
      --set-file job.script={{daft_distributed_script}}

daft-simple-deploy:
    kubectl create namespace {{daft_namespace}} 2>/dev/null || true
    helm upgrade --install {{daft_simple_release}} {{daft_chart}} \
      --namespace {{daft_namespace}} \
      --create-namespace \
      --values {{daft_simple_values}}

daft-simple-deploy-with-job:
    kubectl create namespace {{daft_namespace}} 2>/dev/null || true
    helm upgrade --install {{daft_simple_release}} {{daft_chart}} \
      --namespace {{daft_namespace}} \
      --create-namespace \
      --values {{daft_simple_values}} \
      --set-file job.script={{daft_simple_script}}

daft-distributed-destroy:
    helm uninstall {{daft_distributed_release}} --namespace {{daft_namespace}} || true

daft-simple-destroy:
    helm uninstall {{daft_simple_release}} --namespace {{daft_namespace}} || true

daft-destroy: daft-distributed-destroy daft-simple-destroy
    kubectl delete namespace {{daft_namespace}} --ignore-not-found --wait=false
