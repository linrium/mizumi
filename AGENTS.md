# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Overview

Mizumi is a Kubernetes-native data platform that orchestrates a medallion lakehouse (bronze → silver → gold) using multiple compute engines. All compute runs as ephemeral Kubernetes jobs or workloads. Dagster is the central orchestrator; RustFS (S3-compatible object store) is the unified storage layer.

## Commands

### Package management (Python)

```bash
uv sync              # install / sync dependencies
uv add <package>     # add a dependency
```

Python version is pinned in `.python-version` (3.13).

### Docker image builds

```bash
just spark-image-build      # mizumi-spark-rustfs:4.1.1
just dagster-image-build    # mizumi-dagster:1.13.4
just daft-image-build       # mizumi-daft:0.7.10
just datafusion-image-build # mizumi-datafusion:50.1.0
```

### Full stack deploy / destroy

```bash
just deploy    # RustFS + Unity Catalog + Spark + Dagster
just destroy   # tear down all of the above
just forward   # port-forward all UIs simultaneously
```

### Per-service commands

```bash
# RustFS (S3 storage)
just rustfs-deploy / rustfs-destroy / rustfs-forward   # 9000 S3 API, 9001 console

# Spark (medallion jobs + SDP pipelines)
just spark-deploy        # operator + image build + seed data + app + pipeline
just spark-destroy
just spark-forward       # Spark UI on :4040

# Dagster (orchestrator)
just dagster-deploy / dagster-destroy / dagster-forward   # UI on :8080

# Unity Catalog
just unitycatalog-deploy / unitycatalog-destroy
just unitycatalog-forward        # UC API on :8082
just unitycatalog-ui-forward     # UC UI on :3001

# Daft
just daft-simple-deploy          # single-node Daft job
just daft-distributed-deploy     # Ray-backed distributed Daft job
just daft-distributed-forward    # Ray dashboard :8265, Grafana :3000
just daft-destroy

# Ballista (DataFusion distributed)
just ballista-deploy / ballista-destroy / ballista-forward   # gRPC on :50050

# DataFusion (standalone query)
just datafusion-query            # build image → run K8s job → print logs
```

## Architecture

### Storage (RustFS)

RustFS is an S3-compatible object store deployed in the `rustfs` namespace. All Python jobs connect to it using the S3A protocol:

- Endpoint: `http://rustfs-svc.rustfs.svc.cluster.local:9000`
- Credentials: `rustfsadmin` / `rustfsadmin` (see `packages/dagster/defs_pkg/config.py`)
- Buckets: `bronze` (raw), `silver` (cleaned Parquet), `gold` (aggregated)

### Orchestration (Dagster)

Dagster runs in the `dagster` namespace. All assets live in `packages/dagster/defs_pkg/`:

- `definitions.py` → re-exports `defs` from `defs_pkg/__init__.py`
- `defs_pkg/__init__.py` → assembles `dg.Definitions` with all assets + resources
- `defs_pkg/config.py` → image tags, S3A connection config, pipeline paths
- `defs_pkg/assets/` → one file per compute engine

There are two Dagster resource types used to launch K8s workloads:
1. **`PipesK8sClient`** — runs an arbitrary container as a K8s pod and reads Dagster Pipes messages back. Used by Spark jobs, Daft jobs, and DataFusion jobs.
2. **`SparkPipelinesResource`** — wraps `spark-pipelines-s3` (a patched `spark-pipelines` CLI with S3A JARs pre-loaded) to run Spark Declarative Pipelines (SDP). Used by `medallion_sdp`, `customer_sdp`, and `weekly_sdp`.

Asset dependency graph:
```
bronze_orders
  └─ silver_orders (Spark, PipesK8s)
  └─ medallion_sdp (SDP) → sdp_silver_orders, sdp_gold_daily_country_sales
       └─ customer_sdp (SDP) → sdp_silver_customers, sdp_gold_customer_ltv
            └─ weekly_sdp (SDP) → sdp_gold_weekly_revenue, sdp_gold_weekly_growth
  sdp_silver_orders
  └─ gold_customer_stats (Spark, PipesK8s)
  └─ gold_country_revenue (Spark, PipesK8s)
  silver_orders
  └─ datafusion_rustfs_query (DataFusion, PipesK8s)
daft_simple_job (Daft, PipesK8s)
daft_distributed_job (Daft + Ray, PipesK8s)
```

### Compute engines

| Package | Engine | K8s namespace | Notes |
|---|---|---|---|
| `packages/spark` | PySpark 4.1.1 | `spark` | Medallion ETL jobs + SDP pipelines |
| `packages/dagster` | Dagster 1.13.4 | `dagster` | Orchestrator; also runs `spark-pipelines` for SDP |
| `packages/daft` | Daft 0.7.10 | `daft` | Simple (local) and distributed (Ray) modes |
| `packages/datafusion` | DataFusion 50.1.0 | `spark` | Ad-hoc Parquet queries against RustFS |
| `packages/unitycatalog` | Unity Catalog 0.4.0 | `unitycatalog` | Data catalog with Postgres backend |

### Spark Declarative Pipelines (SDP)

SDP pipelines live in `packages/spark/pipelines/`. Each pipeline has:
- A YAML spec (e.g. `spark-pipeline.yaml`) declaring the Python file and target catalog/database
- A Python file with `@dp.temporary_view` and `@dp.materialized_view` decorators
- SQL definition files in a `definitions/` subdirectory

The Dagster image (`packages/dagster/Dockerfile`) bundles the SDP pipeline files at `/opt/spark/pipelines/` and wraps `spark-pipelines` as `spark-pipelines-s3` with the S3A + Unity Catalog + Delta Lake JARs pre-loaded on the classpath.

### Dagster Pipes pattern

Every job that runs as a K8s pod must use `dagster_pipes.open_dagster_pipes()` and call `pipes.report_asset_materialization(...)` to communicate results back to Dagster. Without this, the asset will error even if the pod succeeds.

### Unity Catalog

Deployed from a custom image (`packages/unitycatalog/Dockerfile`) and backed by the dedicated shared Postgres instance at `shared-postgres-svc.shared-postgres.svc.cluster.local`. A bootstrap job (`infra/k8s/unitycatalog/bootstrap-job.yaml`) seeds the catalog with the initial namespace/schema definitions after deployment.
