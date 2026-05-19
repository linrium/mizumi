set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

controlplane_namespace := "controlplane"
controlplane_manifests := "infra/k8s/controlplane"
controlplane_image := "mizumi-controlplane:0.1.0"

webui_namespace := "webui"
webui_manifests := "infra/k8s/webui"
webui_image := "mizumi-webui:0.1.0"

unitycatalog_namespace := "unitycatalog"
unitycatalog_image := "mizumi-uc:0.1.0"
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
keycloak_image := "mizumi-keycloak:26.3.3"

spark_operator_namespace := "spark-operator"
spark_namespace := "spark"
spark_operator_release := "spark-operator"
spark_operator_chart := "spark-operator/spark-operator"
spark_operator_chart_version := "2.5.0"
spark_operator_values := "infra/k8s/spark/helm/values.yaml"
spark_image := "mizumi-spark-rustfs:4.1.3"
duckdb_image := "mizumi-duckdb:1.1.6"
duckdb_server_image := "mizumi-duckdb-server:0.1.0"
daft_image := "mizumi-daft:0.7.10"

daft_namespace := "daft"
daft_chart := "oci://ghcr.io/eventual-inc/daft/quickstart"
daft_distributed_release := "daft-distributed"
daft_distributed_values := "infra/k8s/daft/helm/distributed-values.yaml"
daft_distributed_script := "infra/k8s/daft/scripts/distributed_job.py"
daft_simple_release := "daft-simple"
daft_simple_values := "infra/k8s/daft/helm/simple-values.yaml"
daft_simple_script := "infra/k8s/daft/scripts/simple_job.py"
caddy_s3_hostname := "s3.ap-southeast-1.amazonaws.com"
caddy_config := "infra/caddy/Caddyfile"

redpanda_namespace := "redpanda"
redpanda_manifests := "infra/k8s/redpanda"
redpanda_default_topic_job := "redpanda-default-topic"

doctor:
  docker pull curlimages/curl:8.13.0
  docker pull docker.io/busybox:1.28
  docker pull docker.io/library/postgres:14.6
  docker pull ghcr.io/kubeflow/spark-operator/controller:2.5.0
  docker pull python:3.11-alpine
  docker pull postgres:16
  docker pull postgres:17
  docker pull postgres:18
  docker pull busybox:stable
  docker pull caddy:2.8-alpine
  docker pull docker.redpanda.com/redpandadata/console:v2.8.3
  docker pull docker.redpanda.com/redpandadata/redpanda:v24.3.11

deploy: \
  doctor \
  rustfs-deploy \
  rustfs-s3-proxy-deploy \
  rustfs-s3-proxy-dns-enable \
  redpanda-deploy \
  keycloak-deploy \
  dagster-deploy \
  unitycatalog-deploy \
  spark-deploy \
  daft-image-build \
  rustfs-unitycatalog-anon-read-enable \
  duckdb-image-build \
  duckdb-server-image-build \
  duckdb-server-deploy \
  spark-image-build \
  controlplane-deploy \
  webui-deploy

destroy: \
  webui-destroy \
  controlplane-destroy \
  duckdb-server-destroy \
  spark-destroy \
  dagster-destroy \
  unitycatalog-destroy \
  keycloak-destroy \
  redpanda-destroy \
  rustfs-destroy

forward:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null; wait' EXIT INT TERM
    kubectl port-forward -n {{ rustfs_namespace }} svc/rustfs-svc 9000:9000 9001:9001 &
    kubectl port-forward -n {{ dagster_namespace }} svc/dagster-dagster-webserver 8088:80 &
    kubectl port-forward -n {{ redpanda_namespace }} svc/redpanda-svc 19092:19092 9644:9644 &
    kubectl port-forward -n {{ redpanda_namespace }} svc/redpanda-console-svc 8081:8080 &
    kubectl port-forward -n {{ keycloak_namespace }} svc/keycloak-svc 8080:8080 &
    kubectl port-forward -n {{ unitycatalog_namespace }} svc/unitycatalog-svc 8082:8080 &
    kubectl port-forward -n {{ dagster_namespace }} svc/dagster-postgresql 5433:5432 &
    kubectl port-forward -n {{ spark_namespace }} svc/duckdb-server-svc 8090:8080 &
    kubectl port-forward -n {{ webui_namespace }} svc/webui-svc 3000:3000 &
    kubectl port-forward -n controlplane svc/controlplane-svc 4000:6000 &
    echo "RustFS console:   http://127.0.0.1:9001"
    echo "RustFS S3 API:    http://127.0.0.1:9000"
    echo "Redpanda Kafka:   127.0.0.1:19092"
    echo "Redpanda Admin:   http://127.0.0.1:9644"
    echo "Redpanda UI:      http://127.0.0.1:8081"
    echo "Keycloak:         http://127.0.0.1:8083"
    echo "Dagster UI:       http://127.0.0.1:8088"
    echo "Dagster GraphQL:  http://127.0.0.1:8088/graphql"
    echo "UC API:           http://127.0.0.1:8082"
    echo "DuckDB Server:    http://127.0.0.1:8090"
    echo "Controlplane API: http://127.0.0.1:4000"
    echo "Shared Postgres:  localhost:5433"
    echo "WebUI:            http://127.0.0.1:3000"
    wait

caddy-s3-proxy:
    caddy run --config {{ caddy_config }}

caddy-s3-trust:
    caddy trust --config {{ caddy_config }}

caddy-s3-setup:
    @echo "1. Ensure RustFS is reachable on http://127.0.0.1:9000 (for example: just forward)"
    @echo "2. Add this host override: 127.0.0.1 {{ caddy_s3_hostname }}"
    @echo "3. Trust Caddy's local CA: just caddy-s3-trust"
    @echo "4. Start the proxy: just caddy-s3-proxy"

rustfs-helm-repo:
    helm repo add rustfs https://charts.rustfs.com/ 2>/dev/null || true
    helm repo update rustfs

rustfs-deploy: rustfs-helm-repo
    helm upgrade --install {{ rustfs_release }} {{ rustfs_chart }} \
      --namespace {{ rustfs_namespace }} \
      --create-namespace \
      --version {{ rustfs_chart_version }} \
      --values {{ rustfs_values }}
    kubectl rollout status deployment/{{ rustfs_release }} -n {{ rustfs_namespace }} --timeout=180s
    kubectl get pods,svc,pvc -n {{ rustfs_namespace }}

rustfs-s3-proxy-deploy:
    kubectl create namespace {{ rustfs_namespace }} 2>/dev/null || true
    kubectl create namespace {{ spark_namespace }} 2>/dev/null || true
    kubectl apply -f infra/k8s/rustfs/s3-proxy.yaml
    kubectl rollout status deployment/rustfs-s3-proxy -n {{ rustfs_namespace }} --timeout=120s
    kubectl get pods,svc,secret,configmap -n {{ rustfs_namespace }} | rg rustfs-s3-proxy

rustfs-s3-proxy-destroy:
    kubectl delete -f infra/k8s/rustfs/s3-proxy.yaml --ignore-not-found

rustfs-s3-proxy-dns-enable:
    #!/usr/bin/env bash
    set -euo pipefail
    corefile=$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}')
    if echo "$corefile" | grep -q 'rustfs-s3-proxy'; then
        echo "CoreDNS rewrite rules already present, skipping"
        exit 0
    fi
    patched=$(echo "$corefile" | awk '/^\s*ready$/{print; print "    rewrite name exact s3.us-east-1.amazonaws.com rustfs-s3-proxy.rustfs.svc.cluster.local"; print "    rewrite name exact unitycatalog.s3.us-east-1.amazonaws.com rustfs-s3-proxy.rustfs.svc.cluster.local"; next}1')
    kubectl patch configmap coredns -n kube-system --patch "{\"data\":{\"Corefile\":$(printf '%s' "$patched" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}}"
    kubectl rollout restart deployment/coredns -n kube-system
    kubectl rollout status deployment/coredns -n kube-system --timeout=120s

rustfs-s3-proxy-dns-disable:
    #!/usr/bin/env bash
    set -euo pipefail
    corefile=$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}')
    patched=$(echo "$corefile" | grep -v 'rustfs-s3-proxy')
    kubectl patch configmap coredns -n kube-system --patch "{\"data\":{\"Corefile\":$(printf '%s' "$patched" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}}"
    kubectl rollout restart deployment/coredns -n kube-system
    kubectl rollout status deployment/coredns -n kube-system --timeout=120s

rustfs-unitycatalog-anon-read-enable:
    kubectl delete job rustfs-unitycatalog-anon-read -n {{ rustfs_namespace }} --ignore-not-found
    kubectl create job rustfs-unitycatalog-anon-read -n {{ rustfs_namespace }} --image=minio/mc:latest -- /bin/sh -ec 'mc alias set rustfs http://rustfs-svc.rustfs.svc.cluster.local:9000 rustfsadmin rustfsadmin && mc anonymous set download rustfs/unitycatalog'
    kubectl wait --for=condition=complete job/rustfs-unitycatalog-anon-read -n {{ rustfs_namespace }} --timeout=120s
    kubectl logs job/rustfs-unitycatalog-anon-read -n {{ rustfs_namespace }}

rustfs-unitycatalog-anon-read-disable:
    kubectl delete job rustfs-unitycatalog-anon-read-disable -n {{ rustfs_namespace }} --ignore-not-found
    kubectl create job rustfs-unitycatalog-anon-read-disable -n {{ rustfs_namespace }} --image=minio/mc:latest -- /bin/sh -ec 'mc alias set rustfs http://rustfs-svc.rustfs.svc.cluster.local:9000 rustfsadmin rustfsadmin && mc anonymous set private rustfs/unitycatalog'
    kubectl wait --for=condition=complete job/rustfs-unitycatalog-anon-read-disable -n {{ rustfs_namespace }} --timeout=120s
    kubectl logs job/rustfs-unitycatalog-anon-read-disable -n {{ rustfs_namespace }}

rustfs-destroy:
    helm uninstall {{ rustfs_release }} --namespace {{ rustfs_namespace }} || true
    kubectl delete namespace {{ rustfs_namespace }} --ignore-not-found --wait=false

keycloak-image-build:
    docker build -t {{ keycloak_image }} packages/keycloak

keycloak-deploy: keycloak-image-build
    kubectl create namespace {{ keycloak_namespace }} 2>/dev/null || true
    kubectl apply -f {{ keycloak_manifests }}/postgres.yaml
    kubectl rollout status statefulset/keycloak-postgres -n {{ keycloak_namespace }} --timeout=300s
    kubectl apply -f {{ keycloak_manifests }}/keycloak.yaml
    kubectl rollout status deployment/keycloak -n {{ keycloak_namespace }} --timeout=300s
    just keycloak-bootstrap
    kubectl get pods,svc,secret -n {{ keycloak_namespace }}

keycloak-bootstrap:
    kubectl delete job keycloak-bootstrap -n {{ keycloak_namespace }} --ignore-not-found
    kubectl apply -f {{ keycloak_manifests }}/bootstrap-job.yaml
    kubectl wait --for=condition=complete job/keycloak-bootstrap -n {{ keycloak_namespace }} --timeout=180s
    kubectl logs job/keycloak-bootstrap -n {{ keycloak_namespace }}

keycloak-destroy:
    helm uninstall keycloak --namespace {{ keycloak_namespace }} || true
    kubectl delete -f {{ keycloak_manifests }}/ --ignore-not-found || true
    kubectl delete namespace {{ keycloak_namespace }} --ignore-not-found --wait=false

redpanda-deploy:
    kubectl create namespace {{ redpanda_namespace }} 2>/dev/null || true
    kubectl apply -f {{ redpanda_manifests }}/
    kubectl rollout status statefulset/redpanda -n {{ redpanda_namespace }} --timeout=180s
    kubectl rollout status deployment/redpanda-console -n {{ redpanda_namespace }} --timeout=180s
    just redpanda-topic-bootstrap
    kubectl get pods,svc,pvc -n {{ redpanda_namespace }}

redpanda-topic-bootstrap:
    kubectl delete job {{ redpanda_default_topic_job }} -n {{ redpanda_namespace }} --ignore-not-found
    kubectl apply -f {{ redpanda_manifests }}/topic-job.yaml
    kubectl wait --for=condition=complete job/{{ redpanda_default_topic_job }} -n {{ redpanda_namespace }} --timeout=120s
    kubectl logs job/{{ redpanda_default_topic_job }} -n {{ redpanda_namespace }}

redpanda-destroy:
    kubectl delete -f {{ redpanda_manifests }}/ --ignore-not-found || true
    kubectl delete namespace {{ redpanda_namespace }} --ignore-not-found --wait=false

spark-helm-repo:
    helm repo add spark-operator https://kubeflow.github.io/spark-operator 2>/dev/null || true
    helm repo update spark-operator

spark-deploy: spark-operator-deploy spark-image-build

spark-operator-deploy: spark-helm-repo
    kubectl create namespace {{ spark_namespace }} 2>/dev/null || true
    helm upgrade --install {{ spark_operator_release }} {{ spark_operator_chart }} \
      --namespace {{ spark_operator_namespace }} \
      --create-namespace \
      --version {{ spark_operator_chart_version }} \
      --values {{ spark_operator_values }}
    kubectl wait --namespace {{ spark_operator_namespace }} --for=condition=Available deployment --all --timeout=180s
    kubectl get pods -n {{ spark_operator_namespace }}
    kubectl get serviceaccount -n {{ spark_namespace }}

spark-image-build:
    docker build -t {{ spark_image }} packages/spark

spark-hello-world: spark-image-build
    kubectl delete sparkapplication hello-world -n {{ spark_namespace }} --ignore-not-found
    kubectl apply -f infra/k8s/spark/hello-world-app.yaml
    kubectl wait sparkapplication/hello-world -n {{ spark_namespace }} \
      --for=jsonpath='{.status.applicationState.state}'=COMPLETED \
      --timeout=120s
    kubectl logs -n {{ spark_namespace }} -l spark-role=driver,spark-app-name=hello-world --tail=50

duckdb-image-build:
    docker build -t {{ duckdb_image }} -f packages/duckdb/Dockerfile .

duckdb-server-image-build:
    docker build -t {{ duckdb_server_image }} packages/duckdb-server

duckdb-server-build: duckdb-server-image-build

duckdb-server-deploy: duckdb-server-image-build
    kubectl apply -f infra/k8s/duckdb/server.yaml
    kubectl rollout status deployment/duckdb-server -n {{ spark_namespace }} --timeout=120s
    kubectl get pods,svc -n {{ spark_namespace }} | rg duckdb-server

duckdb-server-forward:
    kubectl port-forward -n {{ spark_namespace }} svc/duckdb-server-svc 8090:8080

duckdb-server-destroy:
    kubectl delete -f infra/k8s/duckdb/server.yaml --ignore-not-found

duckdb-test-job:
    kubectl delete job duckdb-rustfs-query -n {{ spark_namespace }} --ignore-not-found
    kubectl apply -f infra/k8s/duckdb/query-job.yaml
    kubectl wait --for=condition=complete job/duckdb-rustfs-query -n {{ spark_namespace }} --timeout=120s
    kubectl logs job/duckdb-rustfs-query -n {{ spark_namespace }}

daft-image-build:
    docker build -t {{ daft_image }} -f packages/daft/Dockerfile .

spark-destroy:
    helm uninstall {{ spark_operator_release }} --namespace {{ spark_operator_namespace }} || true
    kubectl delete namespace {{ spark_namespace }} --ignore-not-found --wait=false
    kubectl delete namespace {{ spark_operator_namespace }} --ignore-not-found --wait=false

dagster-helm-repo:
    helm repo add dagster https://dagster-io.github.io/helm 2>/dev/null || true
    helm repo update dagster

dagster-image-build:
    docker build -t {{ dagster_image }} -f packages/dagster/Dockerfile .
    if kubectl get deployment/{{ dagster_release }}-dagster-user-deployments-mizumi -n {{ dagster_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/{{ dagster_release }}-dagster-user-deployments-mizumi -n {{ dagster_namespace }}; \
      kubectl rollout status deployment/{{ dagster_release }}-dagster-user-deployments-mizumi -n {{ dagster_namespace }} --timeout=120s; \
    fi

dagster-deploy: dagster-helm-repo dagster-image-build
    helm upgrade --install {{ dagster_release }} {{ dagster_chart }} \
      --namespace {{ dagster_namespace }} \
      --create-namespace \
      --version {{ dagster_chart_version }} \
      --values {{ dagster_values }}
    kubectl rollout status deployment/{{ dagster_release }}-daemon -n {{ dagster_namespace }} --timeout=300s
    kubectl rollout status deployment/{{ dagster_release }}-dagster-user-deployments-mizumi -n {{ dagster_namespace }} --timeout=300s
    kubectl rollout status deployment/{{ dagster_release }}-dagster-webserver -n {{ dagster_namespace }} --timeout=600s
    kubectl get pods -n {{ dagster_namespace }}

shared-postgres-bootstrap:
    ./scripts/bootstrap-shared-postgres.sh

dagster-destroy:
    helm uninstall {{ dagster_release }} --namespace {{ dagster_namespace }} || true
    kubectl delete namespace {{ dagster_namespace }} --ignore-not-found --wait=false

unitycatalog-image-build:
    docker build -t {{ unitycatalog_image }} packages/uc
    if kubectl get deployment/unitycatalog -n {{ unitycatalog_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/unitycatalog -n {{ unitycatalog_namespace }}; \
      kubectl rollout status deployment/unitycatalog -n {{ unitycatalog_namespace }} --timeout=120s; \
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
      -t {{ unitycatalog_ui_image }} \
      "$tmpdir/ui"
    if kubectl get deployment/unitycatalog-ui -n {{ unitycatalog_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/unitycatalog-ui -n {{ unitycatalog_namespace }}; \
      kubectl rollout status deployment/unitycatalog-ui -n {{ unitycatalog_namespace }} --timeout=120s; \
    fi

unitycatalog-deploy: unitycatalog-image-build unitycatalog-ui-image-build
    kubectl create namespace {{ unitycatalog_namespace }} 2>/dev/null || true
    just unitycatalog-auth-secret-apply
    just shared-postgres-bootstrap
    kubectl apply -f infra/k8s/unitycatalog/postgres.yaml
    kubectl apply -f infra/k8s/unitycatalog/server.yaml
    # kubectl apply -f infra/k8s/unitycatalog/ui.yaml
    kubectl wait --for=condition=Available deployment/unitycatalog -n {{ unitycatalog_namespace }} --timeout=180s
    # kubectl wait --for=condition=Available deployment/unitycatalog-ui -n {{ unitycatalog_namespace }} --timeout=300s
    just unitycatalog-bootstrap
    kubectl get pods,svc -n {{ unitycatalog_namespace }}

unitycatalog-destroy:
    kubectl delete -f infra/k8s/unitycatalog/ --ignore-not-found || true
    kubectl delete namespace {{ unitycatalog_namespace }} --ignore-not-found --wait=false

unitycatalog-auth-secret-apply:
    kubectl create secret generic unitycatalog-auth \
      -n {{ unitycatalog_namespace }} \
      --from-file=UC_INTERNAL_SERVER_KEY_PEM=packages/uc/config/server.key \
      --from-file=UC_INTERNAL_SERVICE_TOKEN=packages/uc/config/token.txt \
      --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace {{ controlplane_namespace }} 2>/dev/null || true
    kubectl create secret generic unitycatalog-auth \
      -n {{ controlplane_namespace }} \
      --from-file=UC_INTERNAL_SERVICE_TOKEN=packages/uc/config/token.txt \
      --dry-run=client -o yaml | kubectl apply -f -
    if kubectl get deployment/unitycatalog -n {{ unitycatalog_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/unitycatalog -n {{ unitycatalog_namespace }}; \
      kubectl rollout status deployment/unitycatalog -n {{ unitycatalog_namespace }} --timeout=120s; \
    fi
    if kubectl get deployment/controlplane -n {{ controlplane_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/controlplane -n {{ controlplane_namespace }}; \
      kubectl rollout status deployment/controlplane -n {{ controlplane_namespace }} --timeout=120s; \
    fi

unitycatalog-bootstrap:
    kubectl delete job unitycatalog-bootstrap -n {{ unitycatalog_namespace }} --ignore-not-found
    kubectl apply -f infra/k8s/unitycatalog/bootstrap-job.yaml
    kubectl wait --for=condition=complete job/unitycatalog-bootstrap -n {{ unitycatalog_namespace }} --timeout=120s
    kubectl logs job/unitycatalog-bootstrap -n {{ unitycatalog_namespace }}

jobs-submit-all token='test':
    just jobs-submit-hdbank {{ token }}
    just jobs-submit-vietjetair {{ token }}

jobs-submit-hdbank token='test':
    curl -fsSL -X POST http://127.0.0.1:4000/api/streaming/jobs \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer {{ token }}" \
      -d '{"name":"hdbank-stream-partner-events-to-bronze","image":"{{ spark_image }}","main_application_file":"local:///opt/spark/jobs/hdbank/stream_partner_events_to_bronze.py"}' \
      | jq

jobs-submit-vietjetair token='test':
    curl -fsSL -X POST http://127.0.0.1:4000/api/streaming/jobs \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer {{ token }}" \
      -d '{"name":"vietjetair-stream-partner-events-to-bronze","image":"{{ spark_image }}","main_application_file":"local:///opt/spark/jobs/vietjetair/stream_partner_events_to_bronze.py"}' \
      | jq

jobs-delete-hdbank token='test':
    #!/usr/bin/env bash
    set -euo pipefail
    for name in hdbank-stream-partner-events-to-bronze; do
      id=$(curl -fsSL http://127.0.0.1:4000/api/streaming/jobs \
        -H "Authorization: Bearer {{ token }}" \
        | jq -r --arg n "$name" '.jobs[] | select(.job.name == $n) | .job.id')
      [[ -z "$id" ]] && { echo "job not found: $name"; continue; }
      curl -fsSL -X DELETE -H "Authorization: Bearer {{ token }}" "http://127.0.0.1:4000/api/streaming/jobs/$id" && echo "deleted: $name"
    done

jobs-delete-vietjetair token='test':
    #!/usr/bin/env bash
    set -euo pipefail
    for name in vietjetair-stream-partner-events-to-bronze; do
      id=$(curl -fsSL http://127.0.0.1:4000/api/streaming/jobs \
        -H "Authorization: Bearer {{ token }}" \
        | jq -r --arg n "$name" '.jobs[] | select(.job.name == $n) | .job.id')
      [[ -z "$id" ]] && { echo "job not found: $name"; continue; }
      curl -fsSL -X DELETE -H "Authorization: Bearer {{ token }}" "http://127.0.0.1:4000/api/streaming/jobs/$id" && echo "deleted: $name"
    done

controlplane-image-build:
    docker build -t {{ controlplane_image }} packages/controlplane
    if kubectl get deployment/controlplane -n {{ controlplane_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/controlplane -n {{ controlplane_namespace }}; \
      kubectl rollout status deployment/controlplane -n {{ controlplane_namespace }} --timeout=120s; \
    fi

controlplane-deploy: controlplane-image-build
    kubectl create namespace {{ controlplane_namespace }} 2>/dev/null || true
    just unitycatalog-auth-secret-apply
    just shared-postgres-bootstrap
    kubectl apply -f {{ controlplane_manifests }}/postgres.yaml
    kubectl apply -f {{ controlplane_manifests }}/deployment.yaml
    kubectl rollout status deployment/controlplane -n {{ controlplane_namespace }} --timeout=120s
    just controlplane-bootstrap
    kubectl get pods,svc -n {{ controlplane_namespace }}

controlplane-bootstrap:
    kubectl delete job controlplane-bootstrap -n {{ controlplane_namespace }} --ignore-not-found
    kubectl apply -f {{ controlplane_manifests }}/bootstrap-job.yaml
    kubectl wait --for=condition=complete job/controlplane-bootstrap -n {{ controlplane_namespace }} --timeout=180s
    kubectl logs job/controlplane-bootstrap -n {{ controlplane_namespace }}

controlplane-destroy:
    kubectl delete -f {{ controlplane_manifests }}/ --ignore-not-found || true
    kubectl delete namespace {{ controlplane_namespace }} --ignore-not-found --wait=false

webui-image-build:
    docker build -t {{ webui_image }} packages/webui
    if kubectl get deployment/webui -n {{ webui_namespace }} &>/dev/null; then \
      kubectl rollout restart deployment/webui -n {{ webui_namespace }}; \
      kubectl rollout status deployment/webui -n {{ webui_namespace }} --timeout=120s; \
    fi

webui-deploy: webui-image-build
    kubectl apply -f {{ webui_manifests }}/deployment.yaml
    kubectl rollout status deployment/webui -n {{ webui_namespace }} --timeout=180s
    kubectl get pods,svc -n {{ webui_namespace }}

webui-destroy:
    kubectl delete -f {{ webui_manifests }}/ --ignore-not-found || true
    kubectl delete namespace {{ webui_namespace }} --ignore-not-found --wait=false

daft-distributed-deploy:
    kubectl create namespace {{ daft_namespace }} 2>/dev/null || true
    helm upgrade --install {{ daft_distributed_release }} {{ daft_chart }} \
      --namespace {{ daft_namespace }} \
      --create-namespace \
      --values {{ daft_distributed_values }}
    # kubectl patch deployment {{ daft_distributed_release }}-worker -n {{ daft_namespace }} --type=json \
    #   -p='[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/timeoutSeconds","value":30},{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/periodSeconds","value":10},{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/timeoutSeconds","value":30},{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/periodSeconds","value":10}]'

daft-distributed-deploy-with-job:
    kubectl create namespace {{ daft_namespace }} 2>/dev/null || true
    helm upgrade --install {{ daft_distributed_release }} {{ daft_chart }} \
      --namespace {{ daft_namespace }} \
      --create-namespace \
      --values {{ daft_distributed_values }} \
      --set-file job.script={{ daft_distributed_script }}
    # kubectl patch deployment {{ daft_distributed_release }}-worker -n {{ daft_namespace }} --type=json \
    #   -p='[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/timeoutSeconds","value":30},{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/periodSeconds","value":10},{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/timeoutSeconds","value":30},{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/periodSeconds","value":10}]'

daft-simple-deploy:
    kubectl create namespace {{ daft_namespace }} 2>/dev/null || true
    helm upgrade --install {{ daft_simple_release }} {{ daft_chart }} \
      --namespace {{ daft_namespace }} \
      --create-namespace \
      --values {{ daft_simple_values }}

daft-simple-deploy-with-job:
    kubectl create namespace {{ daft_namespace }} 2>/dev/null || true
    helm upgrade --install {{ daft_simple_release }} {{ daft_chart }} \
      --namespace {{ daft_namespace }} \
      --create-namespace \
      --values {{ daft_simple_values }} \
      --set-file job.script={{ daft_simple_script }}

daft-distributed-destroy:
    helm uninstall {{ daft_distributed_release }} --namespace {{ daft_namespace }} || true

daft-simple-destroy:
    helm uninstall {{ daft_simple_release }} --namespace {{ daft_namespace }} || true

daft-destroy: daft-distributed-destroy daft-simple-destroy
    kubectl delete namespace {{ daft_namespace }} --ignore-not-found --wait=false
