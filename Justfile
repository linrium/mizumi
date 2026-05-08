set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

rustfs_namespace := "rustfs"
rustfs_release := "rustfs"
rustfs_chart := "rustfs/rustfs"
rustfs_chart_version := "0.1.0"
rustfs_values := "infra/k8s/rustfs/helm/values.yaml"

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
