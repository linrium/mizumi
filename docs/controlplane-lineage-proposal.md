# Controlplane Lineage Proposal

This document proposes a first-class lineage model in `packages/controlplane` that unifies the current metadata spread across Dagster, Unity Catalog, Spark batch jobs, Spark streaming jobs, and Daft jobs.

The goal is not just to draw a prettier graph. The goal is to give `controlplane` a canonical lineage graph that can power:

- blast-radius analysis
- richer lineage visualization
- impact analysis for permissions and governance
- a future OpenLineage-compatible event model

## Problem

Today the system has several partial views of lineage:

- Dagster knows asset-to-asset dependencies and schedules.
- Spark and Daft jobs know physical input and output datasets.
- Spark streaming jobs know Kafka-to-Delta flow.
- Unity Catalog knows catalogs, schemas, and tables.

But there is no canonical graph inside `packages/controlplane`.

That creates three problems:

- The current lineage UI is Dagster-shaped, so it only shows Dagster assets well.
- Physical data movement and orchestration relationships are mixed together or missing.
- Blast-radius analysis cannot be derived reliably from one source of truth.

## What Exists Today

The current codebase already contains most of the metadata needed for a useful first version.

### Dagster orchestration metadata

Dagster asset definitions already encode dependencies between logical assets and the execution engine used to materialize them.

Examples:

- `banking_silver_card_payment_events` depends on `banking_bronze_raw_card_payment_events`
- `banking_gold_marts` yields multiple gold assets from one Spark job
- assets are tagged with kinds such as `spark`, `k8s`, and `daft`

Relevant files:

- `packages/dagster/defs_pkg/assets/banking_spark_jobs.py`
- `packages/dagster/defs_pkg/assets/vietjetair_spark_jobs.py`
- `packages/dagster/defs_pkg/assets/banking_daft.py`

### Unity Catalog-like physical dataset metadata

Bronze placeholder Dagster assets already reference physical dataset locations through metadata.

Examples:

- `s3a://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_card_payment_events_v1`
- `s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_booking_events_v1`

Relevant files:

- `packages/dagster/defs_pkg/assets/banking_bronze.py`
- `packages/dagster/defs_pkg/assets/vietjetair_bronze.py`

### Spark and Daft physical lineage

The batch jobs already contain explicit input and output paths.

Examples:

- `build_card_payment_events_silver.py` reads a bronze Delta table and writes a silver Delta table
- `build_payment_analytics_gold.py` reads silver tables and writes gold tables
- `banking_fraud_analysis_job.py` reads silver and writes gold

Relevant files:

- `packages/spark/jobs/hdbank/build_card_payment_events_silver.py`
- `packages/spark/jobs/hdbank/build_payment_analytics_gold.py`
- `packages/spark/jobs/vietjetair/build_booking_analytics_gold.py`
- `packages/daft/jobs/banking_fraud_analysis_job.py`

### Streaming lineage

The streaming jobs already define source topics, checkpoints, and target Delta locations.

Examples:

- Kafka topic -> Spark streaming job -> bronze Delta path

Relevant files:

- `packages/spark/jobs/hdbank/stream_raw_card_payment_events_to_bronze.py`
- `packages/spark/jobs/hdbank/stream_raw_customer_profile_events_to_bronze.py`
- `packages/spark/jobs/vietjetair/stream_raw_booking_events_to_bronze.py`
- `packages/spark/jobs/vietjetair/stream_raw_customer_events_to_bronze.py`
- `packages/spark/jobs/vietjetair/stream_raw_flight_events_to_bronze.py`

### Controlplane service boundaries

`packages/controlplane` already exposes service and adapter boundaries for:

- Dagster
- Unity Catalog proxying
- streaming jobs
- blast radius previews

So the right place for the canonical graph is `packages/controlplane`.

## Design Goal

`packages/controlplane` should own the canonical lineage graph.

It should unify:

- governance hierarchy
- physical dataset lineage
- orchestration lineage
- runtime lineage over time

It should not be Dagster-only.

It should not require full OpenLineage instrumentation on day one.

It should be compatible with OpenLineage concepts so that runtime events can be added later without redesigning the model.

## Core Principle

Use OpenLineage as the conceptual model, not necessarily the storage model.

OpenLineage is useful because it separates:

- `Job`
- `Run`
- `Dataset`
- metadata facets on each

That maps well to this system.

But `controlplane` also needs metadata that OpenLineage does not model as first-class graph nodes, especially:

- catalog
- schema
- table hierarchy
- schedules
- orchestration assets
- permission blast-radius roots

So the internal model should be OpenLineage-inspired, then extended for controlplane needs.

## Proposed Canonical Graph Model

The graph should distinguish between entities, relationships, and observations.

### 1. LineageNode

A stable entity in the graph.

Suggested fields:

- `id`
- `node_type`
- `platform`
- `namespace`
- `name`
- `display_name`
- `properties`
- `first_seen_at`
- `last_seen_at`

Suggested `node_type` values:

- `catalog`
- `schema`
- `table`
- `topic`
- `dagster_asset`
- `dagster_job`
- `spark_job`
- `streaming_job`
- `daft_job`
- `schedule`
- `dashboard`
- `consumer`

### 2. LineageEdge

A typed relationship between nodes.

Suggested fields:

- `id`
- `src_node_id`
- `dst_node_id`
- `edge_type`
- `properties`
- `first_seen_at`
- `last_seen_at`

Suggested `edge_type` values:

- `contains`
- `reads_from`
- `writes_to`
- `depends_on`
- `orchestrates`
- `triggers`
- `materializes`
- `represents`
- `aliases`

### 3. LineageObservation

A record of where a node or edge came from.

Suggested fields:

- `id`
- `subject_type`
- `subject_id`
- `source_system`
- `extractor`
- `confidence`
- `observed_at`
- `raw_payload`

This is important because many relationships will be inferred from different systems.

Examples:

- a `reads_from` edge inferred from a Spark job file
- a `depends_on` edge fetched from Dagster GraphQL
- a `contains` edge fetched from Unity Catalog

### 4. LineageRun

A runtime execution record.

Suggested fields:

- `run_id`
- `job_node_id`
- `parent_run_id`
- `status`
- `started_at`
- `ended_at`
- `properties`

This is where future OpenLineage event ingestion fits naturally.

## Separate Hierarchy From Lineage

This is the most important modeling decision.

Do not treat all edges as the same kind of lineage.

There are at least three distinct relationship classes:

### Governance hierarchy

- catalog -> schema
- schema -> table

These are containment edges, not transformation lineage.

### Physical data flow

- Kafka topic -> streaming job -> bronze table
- bronze table -> Spark job -> silver table
- silver table -> Daft job -> gold table

These are the edges needed for blast radius and impact analysis.

### Orchestration flow

- Dagster schedule -> Dagster job
- Dagster asset -> Spark job
- Dagster asset -> Daft job
- Dagster asset -> physical dataset

These are useful for operator understanding but should not be confused with data movement.

If these classes are not separated, the graph becomes noisy and blast-radius answers become misleading.

## Identity Strategy

Do not use Dagster asset path as the canonical identity for the graph.

That would preserve the current limitation instead of fixing it.

Instead, use canonical IDs derived from platform, namespace, and name.

### Dataset identity

Prefer Unity Catalog-style logical identity for governed tables:

- namespace: something stable such as `uc://mizumi`
- name: `<catalog>.<schema>.<table>`

Store physical path as an alias or facet:

- `s3://unitycatalog/hdbank/hdbank_payments_prod_silver/card_payment_events_v1`

### Topic identity

- namespace: `kafka://<bootstrap-server>`
- name: `<topic>`

### Dagster identity

- namespace: `dagster://mizumi`
- name: asset or job name

### Spark and Daft job identity

- namespace: `spark://mizumi` or `daft://mizumi`
- name: app name, job file path, or stable logical job name

## Recommendation On Asset Vs Table Identity

A Dagster asset and a physical table should be separate nodes.

They should be connected by a typed edge such as:

- `materializes`
- `represents`

Why:

- a Dagster asset is an orchestration concept
- a UC table is a physical dataset concept
- keeping them separate preserves both orchestration and physical lineage

If they are collapsed into one node too early, the model becomes harder to extend and less correct.

## Proposed Ingestion Strategy

Build this in phases.

### Phase 1: Static and API-derived graph

This phase should not require changing producer code.

Inputs:

- Dagster asset nodes and schedules via existing Dagster adapter
- Unity Catalog metadata via existing UC adapter or direct API calls
- Spark job source files
- Daft job source files
- streaming job source files and `streaming_jobs` table

Extract:

- catalogs, schemas, tables
- Dagster assets, jobs, schedules
- Spark jobs and Daft jobs
- Kafka topics
- physical input/output dataset edges
- orchestration links

This is enough to build a useful graph immediately.

### Phase 2: Runtime observations

Augment the static graph with execution-time evidence.

Inputs:

- Dagster materializations and run metadata
- Spark and Daft materialization metadata already emitted through `dagster-pipes`
- future OpenLineage events if instrumented

Outputs:

- latest successful run per job
- latest materialization per dataset
- observed lineage confidence
- stale or inactive nodes

### Phase 3: Governance and blast radius

Use the graph for product features:

- downstream impact of granting access to a catalog/schema/table
- affected assets, jobs, schedules, and consumers
- high-risk downstream domains
- dependency neighborhood visualizations

## Proposed Extractors

### Dagster extractor

Fetch from existing Dagster API integration:

- asset nodes
- dependency keys
- schedules
- schedule selections
- runs and materializations

Create:

- `dagster_asset` nodes
- `dagster_job` nodes
- `schedule` nodes
- `depends_on` edges between Dagster assets
- `triggers` edges from schedules to jobs or assets

### Unity Catalog extractor

Fetch:

- catalogs
- schemas
- tables
- maybe volumes later

Create:

- `catalog`, `schema`, `table` nodes
- `contains` edges

### Spark batch extractor

Parse Spark job files for:

- `SOURCE_PATH`
- `TARGET_PATH`
- multiple source paths
- multiple target paths
- app name
- materialization metadata

Create:

- `spark_job` nodes
- `reads_from` and `writes_to` edges

### Streaming extractor

Parse streaming job files and optionally the `streaming_jobs` table for:

- Kafka bootstrap server
- topic
- checkpoint path
- target path
- Spark application name

Create:

- `topic` nodes
- `streaming_job` nodes
- `reads_from` topic edges
- `writes_to` dataset edges

### Daft extractor

Parse:

- source Delta paths
- target Delta paths
- job identity

Create:

- `daft_job` nodes
- `reads_from` and `writes_to` edges

## Data Normalization Rules

The system already mixes `s3://` and `s3a://`.

The extractor layer should normalize storage URIs before node creation.

Suggested normalization rules:

- normalize `s3a://` and `s3://` to one canonical scheme
- strip trailing slashes
- preserve original raw value in observation metadata
- derive UC logical identity from known path convention:
  - `s3://unitycatalog/<catalog>/<schema>/<table>`

This path convention is already present in the repo and should be treated as a first-class mapping rule.

## Storage Proposal

Use Postgres first.

A dedicated graph database is not necessary yet.

Reasons:

- the graph size is still manageable
- `controlplane` already uses Postgres
- recursive CTEs are enough for neighborhood and blast-radius traversal
- operational complexity stays lower

Suggested tables:

- `lineage_nodes`
- `lineage_edges`
- `lineage_node_aliases`
- `lineage_observations`
- `lineage_runs`

Important indexes:

- unique key on `(node_type, namespace, name)`
- index on `(src_node_id, edge_type)`
- index on `(dst_node_id, edge_type)`
- index on alias lookup

## API Proposal

Do not extend Dagster-only endpoints for this.

Add a dedicated lineage service and dedicated lineage endpoints in `packages/controlplane`.

Suggested endpoints:

- `GET /api/lineage/search?q=...`
- `GET /api/lineage/nodes/{id}`
- `GET /api/lineage/graph?root=...&direction=upstream|downstream|both&depth=...`
- `GET /api/lineage/blast-radius?root=...`
- `GET /api/lineage/paths?from=...&to=...`
- `POST /api/lineage/rebuild`

Suggested graph response shape:

- `nodes`
- `edges`
- `root`
- `metadata`

Each node should include:

- id
- type
- label
- platform
- status
- properties

Each edge should include:

- source
- target
- type
- confidence

## UI Direction

The current lineage UI is typed around Dagster asset nodes.

That should be changed gradually, not replaced all at once.

Migration path:

1. Keep the current graph UI component.
2. Replace the data source with `/api/lineage/graph`.
3. Add rendering by node type:
   - dataset
   - topic
   - asset
   - job
   - schedule
4. Preserve Dagster-specific details only where they are still useful.

This avoids another Dagster-only backend abstraction.

## Blast Radius Model

Blast radius should be computed from physical data flow first, then enriched with orchestration and governance overlays.

For example:

`hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1`

Downstream blast radius may include:

- silver tables
- gold tables
- Dagster assets that materialize or depend on them
- schedules that trigger those assets
- dashboards or consumers later

The query should be able to answer both:

- direct downstream entities
- transitive downstream entities

It should also support filters:

- only datasets
- only jobs
- only assets
- only production domains

## Confidence Model

Not all edges are equally trustworthy.

Examples:

- Dagster dependency edges are high-confidence orchestration edges.
- Spark `SOURCE_PATH` and `TARGET_PATH` edges are high-confidence physical edges.
- path-to-UC logical identity mapping is medium-to-high confidence if based on a strict path convention.
- inferred asset-to-table equivalence is lower confidence unless explicitly declared.

Store confidence on observations or edges so the UI and blast-radius engine can choose strict or permissive traversal modes.

## First-Step Scope Recommendation

For the first implementation, keep the scope narrow and useful.

### Include

- UC catalogs, schemas, and tables
- Dagster assets and schedules
- Spark batch jobs
- Spark streaming jobs
- Daft jobs
- Kafka topics
- physical lineage edges
- orchestration edges

### Exclude for now

- column-level lineage
- SQL parsing
- dashboard lineage
- user query lineage
- cross-environment lineage
- external OpenLineage collector infrastructure

## Recommended Rollout

### Step 1

Add a canonical lineage domain to `packages/controlplane` with:

- graph node model
- graph edge model
- extractor interfaces
- Postgres storage

### Step 2

Implement a static graph rebuild that:

- reads Dagster metadata
- reads Unity Catalog metadata
- scans Spark and Daft job files
- scans streaming job files
- writes normalized nodes and edges

### Step 3

Add lineage read APIs:

- graph neighborhood
- node detail
- blast radius

### Step 4

Switch the lineage UI to the new graph API.

### Step 5

Add runtime observations and then optional OpenLineage event ingestion.

## Architectural Recommendation

The strongest recommendation in this proposal is:

`packages/controlplane` should own the canonical lineage graph, and OpenLineage should be the compatibility model rather than the only storage model.

That keeps the system:

- accurate enough for governance
- extensible enough for runtime lineage
- compatible with future OpenLineage instrumentation
- independent from Dagster as the sole system of record

## Open Questions

These should be resolved before implementation:

- Should the canonical dataset identity be UC logical name first, with storage path as alias
  - recommended answer: yes
- Should a Dagster asset and a UC table be separate nodes
  - recommended answer: yes
- Should static graph rebuild be batch-only at first or incremental
  - recommended answer: batch rebuild first
- Should blast radius traverse orchestration edges by default
  - recommended answer: no, only as optional overlays

## References

OpenLineage references used for this proposal:

- Facets and core event model: `https://openlineage.io/docs/spec/facets/`
- Naming conventions for jobs and datasets: `https://openlineage.io/docs/1.44.0/spec/naming`
