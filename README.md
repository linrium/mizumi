# Mizumi

## Daft on Kubernetes

This repo includes a Helm-based Daft quickstart setup under `infra/k8s/daft/`, following the current upstream quickstart chart documentation.

Simple mode:

```bash
just daft-simple-deploy
```

Distributed mode:

```bash
just daft-distributed-deploy
```

Ray dashboard and Grafana port-forward for distributed mode:

```bash
just daft-distributed-forward
```

Cleanup:

```bash
just daft-destroy
```

The install commands use the upstream OCI chart `oci://ghcr.io/eventual-inc/daft/quickstart` with script injection via `--set-file job.script=...`.

## Ballista on Kubernetes

This repo also includes a Ballista Kubernetes setup under `infra/k8s/ballista/`, based on the official Apache DataFusion Ballista deployment guide.

Deploy:

```bash
just ballista-deploy
```

Status:

```bash
just ballista-status
```

Port-forward the scheduler gRPC port:

```bash
just ballista-forward
```

Cleanup:

```bash
just ballista-destroy
```

The manifests create:
- one scheduler deployment and service
- two executor replicas
- a `PersistentVolume` and `PersistentVolumeClaim` mounted at `/mnt`

The default `hostPath` for the local volume is `/mnt/ballista`. Change that in `infra/k8s/ballista/pv.yaml` if your cluster nodes use a different local path.

## DataFusion on RustFS

This repo includes a simple Apache DataFusion Python job that queries Parquet data from RustFS using the documented object store registration pattern.

Run:

```bash
just datafusion-query
```

It will:
- build `mizumi-datafusion:50.1.0`
- run a Kubernetes job in the `spark` namespace
- connect to RustFS at `http://rustfs-svc.rustfs.svc.cluster.local:9000`
- query `s3://silver/orders/silver_orders/`

Files:
- [packages/datafusion/query_rustfs.py](/Users/linh/Projects/mizumi/packages/datafusion/query_rustfs.py:1)
- [infra/k8s/datafusion/query-job.yaml](/Users/linh/Projects/mizumi/infra/k8s/datafusion/query-job.yaml:1)
