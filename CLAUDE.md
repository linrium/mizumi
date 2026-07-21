# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Mizumi is a Kubernetes-native data platform that orchestrates a medallion lakehouse (bronze → silver → gold) using multiple compute engines. All compute runs as ephemeral Kubernetes jobs or workloads. Dagster is the central orchestrator; RustFS (S3-compatible object store) is the unified storage layer.

## Commands

### Package management (Python)

```bash
uv sync              # install / sync dependencies
uv add <package>     # add a dependency
```

Python version is pinned in `.python-version` (3.13).

### Full stack deploy / destroy

```bash
scripts/deploy.sh    # RustFS + Unity Catalog + Spark + Dagster
scripts/destroy.sh   # tear down all of the above
scripts/forward.sh   # port-forward all UIs simultaneously
```

### Per-service redeploy / helpers

```bash
scripts/redeploy-rustfs.sh             # rebuild + redeploy RustFS
scripts/redeploy-shared-postgres.sh    # rebuild + redeploy shared Postgres
scripts/redeploy-unitycatalog.sh       # rebuild + redeploy Unity Catalog
scripts/redeploy-keycloak.sh           # rebuild + redeploy Keycloak
scripts/redeploy-dagster.sh            # rebuild + redeploy Dagster release
scripts/redeploy-dagster-spark-jobs.sh # rebuild + redeploy Dagster-launched Spark jobs
scripts/redeploy-controlplane.sh       # rebuild + redeploy controlplane
scripts/redeploy-duckdb-server.sh      # rebuild + redeploy DuckDB server
scripts/restart-streaming-pipelines.sh # restart controlplane-created Spark streaming jobs
scripts/bootstrap-shared-postgres.sh   # seed shared Postgres
scripts/deploy-ml.sh / destroy-ml.sh   # ML stack (MLflow) lifecycle
scripts/deploy-duckdb-server.sh        # standalone DuckDB server deploy
scripts/signoz.sh deploy               # SigNoz + OTel operator
scripts/forward-signoz.sh              # port-forward SigNOz UIs
scripts/setup-metrics-server.sh        # install metrics-server (minikube)
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
