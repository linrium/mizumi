# Mizumi — High-Level Architecture Design

## Overview

Mizumi is a Kubernetes-native data platform built for enterprises that need **polyglot, governed, large-scale data processing**. It combines a medallion lakehouse, multiple compute engines, a metadata catalog, and a governance control plane into a single cohesive system — all running as ephemeral workloads on Kubernetes.

The platform serves multiple tenants (e.g., HDBank, VietJetAir) with strict workspace isolation, time-bounded access controls, lineage-aware blast-radius analysis, and AI-assisted risk governance.

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Mizumi Platform                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        Web UI (Next.js)                     │   │
│  │  Dashboard · Catalog · Lineage · Pipelines · Permissions    │   │
│  │  Query Playground · Streaming Jobs · Teams · Analytics      │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                  Control Plane (Rust / Axum)                │   │
│  │                                                             │   │
│  │  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │ Permission │ │ Lineage  │ │Streaming │ │  AI Agent  │  │   │
│  │  │  Service   │ │ Service  │ │ Service  │ │  (OpenAI)  │  │   │
│  │  └────────────┘ └──────────┘ └──────────┘ └────────────┘  │   │
│  │  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │  DuckDB    │ │  Dagster │ │   Team   │ │    UC      │  │   │
│  │  │  Session   │ │  Proxy   │ │ Service  │ │  Proxy     │  │   │
│  │  └────────────┘ └──────────┘ └──────────┘ └────────────┘  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│          ┌──────────────────┼──────────────────┐                   │
│          │                  │                  │                   │
│  ┌───────▼──────┐  ┌────────▼───────┐  ┌──────▼──────┐           │
│  │    Dagster   │  │  Unity Catalog │  │   Keycloak  │           │
│  │ Orchestrator │  │  (Rust / UC)   │  │   (OIDC)    │           │
│  └───────┬──────┘  └────────┬───────┘  └─────────────┘           │
│          │                  │                                       │
│    ┌─────┴─────────────────┴──────────────────────────────┐       │
│    │               Compute Engines (Kubernetes)            │       │
│    │                                                       │       │
│    │  ┌──────────┐  ┌──────┐  ┌────────┐  ┌───────────┐  │       │
│    │  │  Spark   │  │ Daft │  │DuckDB  │  │DataFusion │  │       │
│    │  │  Batch + │  │ ML + │  │Ad-hoc  │  │ Columnar  │  │       │
│    │  │Streaming │  │Multi-│  │ SQL    │  │ Queries   │  │       │
│    │  │  ETL     │  │model │  │        │  │           │  │       │
│    │  └──────────┘  └──────┘  └────────┘  └───────────┘  │       │
│    └───────────────────────┬───────────────────────────────┘       │
│                            │                                       │
│  ┌─────────────────────────▼──────────────────────────────────┐   │
│  │              RustFS (S3-Compatible Object Store)            │   │
│  │                                                             │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │   │
│  │  │   bronze/  │  │  silver/   │  │       gold/        │   │   │
│  │  │  (raw)     │  │ (cleaned)  │  │   (aggregated)     │   │   │
│  │  └────────────┘  └────────────┘  └────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           Redpanda (Kafka-Compatible Streaming Broker)       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Storage — RustFS

RustFS is an S3-compatible object store deployed in Kubernetes. It serves as the **single unified storage layer** for every compute engine in the platform.

- **Protocol:** S3A (from Spark/Daft), standard S3 HTTP (from DuckDB, DataFusion)
- **Buckets:** `bronze` (raw ingestion), `silver` (cleaned Parquet / Delta Lake), `gold` (aggregated marts)
- **Format:** Delta Lake everywhere — enables ACID transactions, time travel, schema evolution
- **Access:** All engines use a shared endpoint `http://rustfs-svc.rustfs.svc.cluster.local:9000`

---

### 2. Metadata & Governance — Unity Catalog (Rust Rewrite)

Unity Catalog is the **single source of truth** for all data assets. Mizumi replaces the reference Java implementation with a custom Rust service (`packages/uc`) for performance and integration flexibility.

**Capabilities:**
- Hierarchical namespace: `catalog → schema → table → column`
- Delta Lake table registration with S3 location pointers
- Fine-grained access control (catalog / schema / table / column level)
- S3 temporary credential vending — engines request short-lived keys instead of holding long-lived secrets
- MLflow-compatible model registry (models + versions)
- SCIM2 user management
- OAuth2 / JWT authentication with pluggable authorizer

**Engine Integration:**
- **Spark**: Unity Catalog Spark connector injects catalog metadata at job startup
- **Daft**: DeltaLake reader resolves table locations via UC
- **DuckDB**: `unity_catalog` extension attaches catalogs as read-only in-memory databases

---

### 3. Orchestration — Dagster

Dagster is the **central orchestrator** for all batch compute workloads. Every compute job runs as an ephemeral Kubernetes pod via `PipesK8sClient`.

**Asset Graph (Multi-Tenant):**

```
Redpanda (Kafka)
    │
    ▼
Bronze Assets (Raw Streaming Ingestion — Spark Streaming)
    ├── banking_bronze_raw_card_payment_events
    ├── banking_bronze_raw_customer_profile_events
    ├── vietjetair_bronze_raw_flight_events
    ├── vietjetair_bronze_raw_customer_events
    └── vietjetair_bronze_raw_booking_events
    │
    ▼
Silver Assets (Cleaned / Deduplicated — Spark Batch)
    ├── banking_silver_card_payment_events
    ├── banking_silver_customer_profiles
    ├── vietjetair_silver_flights
    ├── vietjetair_silver_customers
    └── vietjetair_silver_ticket_bookings
    │
    ▼
Gold Assets (Aggregated Marts)
    ├── banking_gold_risk_detection          (Spark)
    ├── banking_gold_merchant_revenue         (Spark)
    ├── banking_gold_user_spend               (Spark)
    ├── banking_gold_customer_risk_scores     (Daft — ML scoring)
    ├── banking_gold_fraud_pattern_analysis   (Daft — ML clustering)
    ├── vietjetair_gold_booking_analytics     (Spark)
    └── vietjetair_gold_customer_spend        (Spark)
```

**Scheduling:** Daily and hourly schedules drive batch pipelines. The control plane proxies Dagster's GraphQL API so the Web UI never speaks to Dagster directly.

---

### 4. Compute Engines

Mizumi selects the right engine per workload type:

| Engine | Use Case | Runtime | Notes |
|--------|----------|---------|-------|
| **Spark (Batch)** | Large-scale ETL, aggregations | K8s job | PySpark 4.1.1, SparkOperator CRD |
| **Spark (Streaming)** | Real-time ingestion from Redpanda | K8s long-running pod | Structured Streaming, Delta Lake sink |
| **Daft** | Multi-model, ML batch scoring | K8s job or Ray cluster | Native Delta Lake, vectorized execution |
| **DuckDB** | Interactive SQL, data discovery | Ephemeral K8s pod or persistent server | UC extension, Delta Lake reader |
| **DataFusion** | Arrow-native ad-hoc columnar queries | K8s job | Lightweight, no JVM overhead |

All engines:
1. Authenticate to Unity Catalog to resolve table locations
2. Read/write Delta Lake files on RustFS via S3 protocol
3. Report asset materialization back to Dagster via `dagster_pipes`

---

### 5. Streaming Pipeline

Real-time data flows from source systems through Redpanda into the bronze lakehouse layer:

```
Source Systems (HDBank, VietJetAir)
        │
        ▼
   Redpanda (Kafka)
   Topics: card-payments, customer-profiles, flights, bookings
        │
        ▼
  Spark Structured Streaming Jobs (K8s pods, managed by Control Plane)
  • Micro-batch ingestion
  • Schema validation
  • Delta Lake writes with checkpointing
        │
        ▼
  bronze/ bucket (RustFS)
  • card_payment_events_v0
  • customer_profile_events_v0
  • flight_events_v0, booking_events_v0
        │
        ▼
  Spark Batch (Dagster-scheduled)
  Silver transformation → Gold aggregation
```

Streaming jobs are created, monitored, and restarted through the Control Plane Streaming Service, which manages `SparkApplication` CRDs in Kubernetes.

---

### 6. Control Plane

The Control Plane (`packages/controlplane`) is a Rust/Axum API server that acts as the **governance and operational hub** of the platform. It is the only backend the Web UI speaks to.

#### 6.1 Permission & Access Service

Manages the complete lifecycle of data access requests with multi-stage approval workflows.

```
User submits access request
        │
        ▼
Blast-Radius computation (lineage graph BFS)
        │
        ▼
AI Risk Assessment (OpenAI)
  → risk_level: low / medium / high
  → recommendation: guardrail suggestion
        │
        ▼
Policy Template matching
  ┌─────────────────┬──────────────────────┐
  │  auto-approve   │  reviewer gate       │  security escalation
  │  (low risk)     │  (medium risk)       │  (high risk / sensitive)
  └─────────────────┴──────────────────────┘
        │
        ▼
Time-Bounded Grant created in Unity Catalog
  • Expiration enforced by UC authorization layer
  • Renewal tracked in control plane
        │
        ▼
Audit Log entry persisted
```

**Policy Templates** define reusable approval rules per resource:

| Template | Resource Scope | Approval Mode | Risk Level |
|----------|---------------|---------------|------------|
| VietJet sandbox read | schema | auto | low |
| HDBank payments read | schema | reviewer gate | medium |
| Partner analytics read | schema | reviewer gate | medium |
| HDBank chargeback write | table | security escalation | high |

#### 6.2 Lineage Service

Automatically builds and maintains a **full data lineage graph** by syncing from multiple sources:

```
Sources:
  ├── Dagster GraphQL API        → asset dependency DAG
  ├── Unity Catalog API          → catalog / schema / table hierarchy
  └── Spark job source analysis  → input/output path extraction

                    ↓  Sync

Lineage Graph (PostgreSQL)
  Nodes: tables, datasets, dashboards, schedules
  Edges: data dependencies with confidence scores
  Aliases: S3 paths ↔ UC table names

                    ↓  Query

  /api/lineage/search           → find entities by name
  /api/lineage/graph            → full graph for visualization
  /api/lineage/blast-radius     → downstream impact (BFS traversal)
  /api/lineage/nodes/{id}       → single node with neighbors
```

#### 6.3 AI Agent (LLM Risk Assessment)

When an access request is submitted, the control plane calls OpenAI with structured context:

**Input:**
- Resource name, scope, privileges requested
- User rationale
- Blast-radius metrics: downstream assets, dashboards, consumers, sensitive data domains

**Output (JSON schema enforced):**
```json
{
  "risk_level": "medium",
  "recommendation": "Time-box to 24 hours and restrict export",
  "explanation": "This access touches 11 downstream tables including 2 risk-scoring dashboards used in production fraud detection."
}
```

The recommendation is shown to human approvers alongside the blast-radius visualization, enabling informed, fast decisions.

#### 6.4 Streaming Job Manager

Manages the full lifecycle of Spark Streaming jobs through Kubernetes:

- Create: persist config to Postgres, apply `SparkApplication` CRD to K8s
- List / Status: query K8s API for runtime state (running, failed, completed)
- Logs: stream pod logs back through the API
- Restart: delete + re-create the CRD
- Delete: remove CRD + Postgres record

#### 6.5 DuckDB Query Engine / Session Pool

Provides interactive SQL access to the data catalog without requiring a persistent cluster:

- **Ad-hoc queries**: Controlplane launches an ephemeral K8s pod with the query in an env var, waits for JSON result
- **Stateful sessions**: Long-running DuckDB server pods with session IDs, enabling multi-query workflows
- Each DuckDB instance auto-attaches UC catalogs (hdbank, vietjetair, partnership_sandbox) on startup

#### 6.6 Dagster Proxy

The control plane proxies all Dagster GraphQL operations:

- List assets, asset dependency DAGs
- Trigger materializations (single asset or batch)
- View runs, run status, run logs
- Manage schedules

This keeps Dagster's API internal to the cluster while giving the Web UI a single unified API surface.

---

### 7. Identity & Access — Keycloak

All services authenticate via **Keycloak OIDC**:

- Web UI sessions use Keycloak OAuth2 code flow
- Control Plane validates JWTs on every protected route
- Unity Catalog validates JWTs for catalog operations
- Users and teams are provisioned in Keycloak and synced to both the control plane and Unity Catalog's SCIM2 endpoint

---

### 8. Web UI

A Next.js frontend that provides a unified operational surface:

| Section | Capabilities |
|---------|-------------|
| **Dashboard** | Platform health, recent runs, access request queue |
| **Catalog** | Browse catalogs / schemas / tables, view schema, sample data, request access |
| **Lineage** | Interactive lineage graph with upstream/downstream traversal |
| **Pipelines** | Asset DAG, run history, step execution graph, schedules |
| **Streaming** | Create and monitor Spark Streaming jobs, view logs |
| **Permissions** | Submit access requests, review blast-radius, approve/deny requests, manage policy templates, view time-bound grants |
| **Query Playground** | Monaco SQL editor backed by DuckDB sessions via control plane |
| **Teams** | Create teams, manage membership (used in approval workflows) |
| **Apps** | Tenant-specific workspaces (HDBank, VietJetAir, Ecommerce) |

---

## Multi-Tenant Workspace Model

Mizumi isolates tenants at multiple levels:

```
Platform
├── Workspace: hdbank
│   ├── UC Catalog: hdbank
│   │   ├── hdbank_payments_prod_bronze
│   │   ├── hdbank_payments_prod_silver
│   │   └── hdbank_payments_prod_gold
│   ├── UC Catalog: hdbank_sandbox
│   ├── Policy Templates (HDBank-specific)
│   └── Teams: hdbank-analytics, hdbank-security
│
├── Workspace: vietjetair
│   ├── UC Catalog: vietjetair
│   │   ├── vietjetair_bookings_prod_bronze
│   │   ├── vietjetair_bookings_prod_silver
│   │   └── vietjetair_bookings_prod_gold
│   ├── UC Catalog: vietjetair_sandbox
│   ├── Policy Templates (VietJetAir-specific)
│   └── Teams: vjetair-analytics
│
└── Workspace: partnership_sandbox
    ├── UC Catalog: partnership_sandbox
    │   └── credit_risk
    └── Teams: partner-data-team
```

Isolation is enforced by:
1. UC fine-grained permissions (catalog/schema/table level)
2. Time-bounded grants with expiration in UC
3. Policy templates scoped to specific resources
4. Team-based approval routing

---

## Governance Flow — End to End

```
                    ┌────────────────────────────────┐
                    │     Data Consumer               │
                    │  "I need read access to          │
                    │   hdbank gold payment data"      │
                    └───────────────┬────────────────┘
                                    │ POST /api/permissions/requests
                                    ▼
                    ┌───────────────────────────────────────┐
                    │          Control Plane                │
                    │                                       │
                    │  1. Compute blast-radius              │
                    │     (lineage graph BFS)               │
                    │     → 11 downstream tables            │
                    │     → 2 risk-scoring dashboards       │
                    │     → 3 sensitive domains             │
                    │                                       │
                    │  2. AI risk assessment (OpenAI)        │
                    │     → risk_level: medium              │
                    │     → recommendation: "time-box 24h"  │
                    │                                       │
                    │  3. Match policy template             │
                    │     → approval_mode: reviewer_gate    │
                    └───────────────┬───────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────┐
                    │         Approval Queue                │
                    │   Data Steward reviews:               │
                    │   • Blast-radius visualization        │
                    │   • AI recommendation                 │
                    │   • User rationale                    │
                    │   → Approve with 7-day expiration     │
                    └───────────────┬───────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────┐
                    │       Unity Catalog                   │
                    │   Grant: READ on                      │
                    │   hdbank.hdbank_payments_prod_gold     │
                    │   Expires: 2026-05-25                 │
                    │   Tracked in: time_bound_grants       │
                    └───────────────┬───────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────┐
                    │         Audit Log                     │
                    │   • requester, resource, scope        │
                    │   • approver, timestamp               │
                    │   • blast-radius snapshot             │
                    │   • AI recommendation at time of req  │
                    └───────────────────────────────────────┘
```

---

## Kubernetes Infrastructure

All components run in dedicated Kubernetes namespaces:

| Namespace | Services | Notes |
|-----------|----------|-------|
| `rustfs` | RustFS StatefulSet | S3 API :9000, Console :9001 |
| `spark` | Spark Operator, Spark jobs | SparkApplication CRDs |
| `dagster` | Webserver, Daemon, PostgreSQL | Helm Chart |
| `daft` | Daft jobs, Ray cluster | Simple + distributed modes |
| `unitycatalog` | UC server, UC UI, PostgreSQL | Custom Rust image |
| `keycloak` | Keycloak, PostgreSQL | OIDC provider |
| `controlplane` | Control Plane API, PostgreSQL | Rust/Axum |
| `redpanda` | Broker, Console | Kafka-compatible |
| `ballista` | Distributed DataFusion | Optional, gRPC :50050 |

**Ephemeral compute:** Spark batch jobs, Daft jobs, and DuckDB query pods are launched on-demand and cleaned up automatically after completion. Only streaming jobs run as long-lived pods.

---

## Data Flow Summary

```
External Sources
      │
      │  (real-time)
      ▼
  Redpanda ─────────────────────────────────────────────────────────┐
      │                                                             │
      │  Spark Streaming (managed by Control Plane)                │
      ▼                                                             │
  bronze/ (RustFS)                                                  │
  Delta Lake tables                                                 │
      │                                                             │
      │  Dagster-scheduled Spark Batch                             │
      ▼                                                             │
  silver/ (RustFS)                                                  │
  Cleaned, deduplicated, standardized                               │
      │                                                             │
      │  Dagster-scheduled Spark / Daft                            │
      ▼                                                             │
  gold/ (RustFS)                                                    │
  Aggregated marts + ML scores + analytics                          │
      │                                                             │
      │  DuckDB (interactive)                                       │
      │  Spark (further transforms)                                 │
      │  DataFusion (ad-hoc columnar)                               │
      ▼                                                             │
  Unity Catalog (table registry)                                    │
      │                                                             │
      │  Control Plane → Web UI                                     │
      ▼                                                             │
  Consumers: Analysts, Dashboards, ML Models, Partner APIs ◄────────┘
```

---

## Technology Stack Summary

| Layer | Technology | Language | Purpose |
|-------|-----------|----------|---------|
| **Storage** | RustFS | Rust | S3-compatible object store |
| **Table Format** | Delta Lake | — | ACID transactions, time travel |
| **Streaming Broker** | Redpanda | C++ | Kafka-compatible event streaming |
| **ETL Engine** | Apache Spark 4.1.1 | Python | Large-scale batch + streaming ETL |
| **ML Engine** | Daft 0.7.10 | Python/Rust | Multi-model batch scoring, distributed ML |
| **Interactive SQL** | DuckDB | C++ | Ad-hoc queries, data discovery |
| **Columnar Engine** | DataFusion 50.1.0 | Rust | Arrow-native SQL queries |
| **Orchestrator** | Dagster 1.13.4 | Python | Asset-based pipeline orchestration |
| **Metadata** | Unity Catalog (Rust) | Rust | Table registry, governance, credential vending |
| **Control Plane** | Axum | Rust | Governance API, lineage, permissions |
| **Frontend** | Next.js 16 + React 19 | TypeScript | Web UI |
| **Identity** | Keycloak | Java | OIDC, JWT, OAuth2 |
| **Infrastructure** | Kubernetes | — | Container orchestration |
| **AI** | OpenAI API | — | Risk assessment, guardrail recommendations |

---

## Key Architectural Principles

### 1. Ephemeral Compute
Every compute job (Spark batch, Daft, DuckDB, DataFusion) runs as an on-demand Kubernetes pod. Resources are provisioned on job start and reclaimed on completion. Only streaming jobs run persistently.

### 2. Unified Storage, Polyglot Compute
A single RustFS storage layer serves all engines. The right engine is chosen per workload: Spark for large ETL, Daft for ML, DuckDB for exploration, DataFusion for fast ad-hoc columnar work.

### 3. Governance First
Every data access flows through Unity Catalog authorization. Time-bounded grants enforce access expiration. The control plane adds multi-stage approval workflows, blast-radius analysis, and audit trails on top of UC's native permission model.

### 4. Lineage-Aware Security
Blast-radius analysis uses the full lineage graph (built from Dagster assets + UC metadata) to compute the transitive downstream impact of any access grant. A requester asking for read access to one table automatically surfaces all downstream dashboards, pipelines, and consumers that would be exposed.

### 5. AI-Augmented Decisions
The OpenAI integration does not automate approvals — it augments human decision-making. Approvers see a structured risk assessment alongside the blast-radius visualization, enabling faster and more consistent governance decisions.

### 6. Multi-Tenant by Design
Workspaces (hdbank, vietjetair, partnership_sandbox) are isolated at the UC catalog level. Policy templates, teams, and approval workflows are scoped per tenant. The sandbox workspace provides safe exploration without production data risk.
