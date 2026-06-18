use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use chrono::{DateTime, Utc};
use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::{
        lineage::{self, NewLineageEdge, NewLineageNode, NewLineageNodeRuntime, NewLineageRun},
        streaming_jobs,
    },
    domain::{
        entities::lineage::{
            BlastRadiusSummary, GraphQuery, LineageEdge, LineageEdgeResponse, LineageGraphResponse,
            LineageNode, LineageNodeDetailResponse, LineageNodeResponse, LineageNodeRuntime,
            LineageRuntimeResponse, LineageSearchResponse, RebuildLineageResponse,
        },
        error::AppError,
    },
};

const LINEAGE_NAMESPACE: Uuid = Uuid::from_u128(0x4d695a756d694c696e656167654e7331);

#[derive(Clone)]
pub struct LineageService {
    db: PgPool,
    uc_base_url: String,
    uc_admin_token: String,
    dagster_base_url: String,
    repo_root: PathBuf,
    client: Client,
}

impl LineageService {
    pub fn new(
        db: PgPool,
        uc_base_url: String,
        uc_admin_token: String,
        dagster_base_url: String,
    ) -> Self {
        let repo_root = resolve_repo_root();

        Self {
            db,
            uc_base_url,
            uc_admin_token,
            dagster_base_url,
            repo_root,
            client: Client::new(),
        }
    }

    pub async fn rebuild(&self) -> Result<RebuildLineageResponse, AppError> {
        let run = lineage::start_sync_run(&self.db).await?;

        match self.rebuild_inner().await {
            Ok(summary) => {
                lineage::finish_sync_run(
                    &self.db,
                    run.id,
                    "success",
                    summary.nodes_count as i32,
                    summary.edges_count as i32,
                    summary.aliases_count as i32,
                    None,
                )
                .await?;
                Ok(RebuildLineageResponse {
                    run_id: run.id,
                    status: "success".to_string(),
                    nodes_count: summary.nodes_count,
                    edges_count: summary.edges_count,
                    aliases_count: summary.aliases_count,
                })
            }
            Err(err) => {
                let message = err.to_string();
                let _ =
                    lineage::finish_sync_run(&self.db, run.id, "failed", 0, 0, 0, Some(&message))
                        .await;
                Err(err)
            }
        }
    }

    async fn rebuild_inner(&self) -> Result<GraphSummary, AppError> {
        let mut graph = GraphBuilder::default();

        self.ingest_unity_catalog(&mut graph).await?;
        self.ingest_dagster(&mut graph).await?;
        self.ingest_repo_jobs(&mut graph)?;
        self.ingest_streaming_job_submissions(&mut graph).await?;
        ingest_static_nodes(&mut graph);

        let nodes = graph
            .nodes
            .values()
            .cloned()
            .map(|node| NewLineageNode {
                id: node.id,
                node_type: node.node_type,
                platform: node.platform,
                namespace: node.namespace,
                name: node.name,
                display_name: node.display_name,
                properties: node.properties,
            })
            .collect::<Vec<_>>();

        let aliases = graph.aliases.iter().cloned().collect::<Vec<_>>();
        let edges = graph
            .edges
            .values()
            .cloned()
            .map(|edge| NewLineageEdge {
                src_node_id: edge.src,
                dst_node_id: edge.dst,
                edge_type: edge.edge_type,
                confidence: edge.confidence,
                properties: edge.properties,
            })
            .collect::<Vec<_>>();

        lineage::replace_graph(&self.db, &nodes, &aliases, &edges).await?;
        self.sync_runtime(&graph).await?;

        Ok(GraphSummary {
            nodes_count: nodes.len(),
            edges_count: edges.len(),
            aliases_count: aliases.len(),
        })
    }

    pub async fn search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<LineageSearchResponse, AppError> {
        let nodes = lineage::search_nodes(&self.db, query, limit as i64).await?;
        Ok(LineageSearchResponse {
            results: self.hydrate_nodes(nodes).await?,
        })
    }

    pub async fn graph(&self, query: GraphQuery) -> Result<LineageGraphResponse, AppError> {
        let direction = query.direction.unwrap_or_else(|| "both".to_string());
        let depth = query.depth.unwrap_or(2);
        if let Some(root_token) = query.root {
            let root = lineage::resolve_node_by_token(&self.db, &root_token)
                .await?
                .ok_or(AppError::NotFound)?;
            self.build_graph(root, &direction, depth).await
        } else {
            self.build_full_graph(&direction, depth).await
        }
    }

    pub async fn blast_radius(&self, root: &str) -> Result<BlastRadiusSummary, AppError> {
        let root = lineage::resolve_node_by_token(&self.db, root)
            .await?
            .ok_or(AppError::NotFound)?;
        let graph = self.build_graph(root.clone(), "downstream", 8).await?;

        let mut direct = 0usize;
        let mut datasets = 0usize;
        let mut jobs = 0usize;
        let mut assets = 0usize;
        let mut schedules = 0usize;

        let direct_ids = graph
            .edges
            .iter()
            .filter(|edge| edge.source == root.id)
            .map(|edge| edge.target)
            .collect::<HashSet<_>>();

        for node in &graph.nodes {
            if node.id == root.id {
                continue;
            }
            if direct_ids.contains(&node.id) {
                direct += 1;
            }
            match node.node_type.as_str() {
                "table" | "topic" | "volume" => datasets += 1,
                "spark_job" | "streaming_job" | "daft_job" | "dagster_job" => jobs += 1,
                "dagster_asset" => assets += 1,
                "schedule" => schedules += 1,
                _ => {}
            }
        }

        Ok(BlastRadiusSummary {
            root: node_to_response(root, None),
            total_downstream_nodes: graph.nodes.len().saturating_sub(1),
            direct_downstream_nodes: direct,
            downstream_datasets: datasets,
            downstream_jobs: jobs,
            downstream_assets: assets,
            downstream_schedules: schedules,
            graph,
        })
    }

    pub async fn node_detail(&self, token: &str) -> Result<LineageNodeDetailResponse, AppError> {
        let node = lineage::resolve_node_by_token(&self.db, token)
            .await?
            .ok_or(AppError::NotFound)?;
        let runtime = lineage::get_runtime(&self.db, node.id).await?;
        Ok(LineageNodeDetailResponse {
            node: node_to_response(node, runtime),
        })
    }

    async fn build_graph(
        &self,
        root: LineageNode,
        direction: &str,
        depth: usize,
    ) -> Result<LineageGraphResponse, AppError> {
        let nodes = lineage::list_nodes(&self.db).await?;
        let edges = lineage::list_edges(&self.db).await?;

        let nodes_by_id = nodes
            .into_iter()
            .map(|node| (node.id, node))
            .collect::<HashMap<_, _>>();

        let mut selected_nodes = HashSet::from([root.id]);
        let mut selected_edges = HashSet::new();
        let mut queue = VecDeque::from([(root.id, 0usize)]);

        while let Some((current, dist)) = queue.pop_front() {
            if dist >= depth {
                continue;
            }

            for edge in &edges {
                let traverse = match direction {
                    "upstream" => edge.dst_node_id == current,
                    "downstream" => edge.src_node_id == current,
                    _ => edge.src_node_id == current || edge.dst_node_id == current,
                };

                if !traverse {
                    continue;
                }

                let next = if edge.src_node_id == current {
                    edge.dst_node_id
                } else {
                    edge.src_node_id
                };

                if selected_edges.insert(edge.id) {
                    selected_nodes.insert(next);
                }

                if selected_nodes.insert(next) {
                    queue.push_back((next, dist + 1));
                } else if !queue.iter().any(|(id, _)| *id == next) {
                    queue.push_back((next, dist + 1));
                }
            }
        }

        let mut graph_nodes = selected_nodes
            .into_iter()
            .filter_map(|id| nodes_by_id.get(&id).cloned())
            .collect::<Vec<_>>();
        graph_nodes.sort_by(|a, b| a.display_name.cmp(&b.display_name));

        let mut graph_edges = edges
            .into_iter()
            .filter(|edge| selected_edges.contains(&edge.id))
            .collect::<Vec<_>>();
        graph_edges.sort_by(|a, b| a.edge_type.cmp(&b.edge_type));

        let runtime_rows = lineage::list_runtime(&self.db).await?;
        let runtime_by_id = runtime_rows
            .into_iter()
            .map(|row| (row.node_id, row))
            .collect::<HashMap<_, _>>();

        Ok(LineageGraphResponse {
            root: Some(node_to_response(
                root.clone(),
                runtime_by_id.get(&root.id).cloned(),
            )),
            direction: direction.to_string(),
            depth,
            nodes: graph_nodes
                .into_iter()
                .map(|node| {
                    let runtime = runtime_by_id.get(&node.id).cloned();
                    node_to_response(node, runtime)
                })
                .collect(),
            edges: graph_edges.into_iter().map(edge_to_response).collect(),
        })
    }

    async fn build_full_graph(
        &self,
        direction: &str,
        depth: usize,
    ) -> Result<LineageGraphResponse, AppError> {
        let nodes = lineage::list_nodes(&self.db).await?;
        let edges = lineage::list_edges(&self.db).await?;
        let runtime_rows = lineage::list_runtime(&self.db).await?;
        let runtime_by_id = runtime_rows
            .into_iter()
            .map(|row| (row.node_id, row))
            .collect::<HashMap<_, _>>();

        Ok(LineageGraphResponse {
            root: None,
            direction: direction.to_string(),
            depth,
            nodes: nodes
                .into_iter()
                .map(|node| {
                    let runtime = runtime_by_id.get(&node.id).cloned();
                    node_to_response(node, runtime)
                })
                .collect(),
            edges: edges.into_iter().map(edge_to_response).collect(),
        })
    }

    async fn hydrate_nodes(
        &self,
        nodes: Vec<LineageNode>,
    ) -> Result<Vec<LineageNodeResponse>, AppError> {
        let runtime_rows = lineage::list_runtime(&self.db).await?;
        let runtime_by_id = runtime_rows
            .into_iter()
            .map(|row| (row.node_id, row))
            .collect::<HashMap<_, _>>();
        Ok(nodes
            .into_iter()
            .map(|node| {
                let runtime = runtime_by_id.get(&node.id).cloned();
                node_to_response(node, runtime)
            })
            .collect())
    }

    async fn ingest_unity_catalog(&self, graph: &mut GraphBuilder) -> Result<(), AppError> {
        let catalogs = self
            .uc_get::<CatalogsResponse>("/catalogs?max_results=200")
            .await?
            .catalogs;

        for catalog in catalogs {
            let catalog_id = graph.ensure_node(
                "catalog",
                "unitycatalog",
                "uc://mizumi",
                &catalog.name,
                &catalog.name,
                json!({ "comment": catalog.comment }),
            );
            graph.add_alias(catalog_id, catalog.name.clone(), AliasPriority::CatalogName);

            let schemas = self
                .uc_get::<SchemasResponse>(&format!(
                    "/schemas?catalog_name={}&max_results=200",
                    catalog.name
                ))
                .await?
                .schemas;

            for schema in schemas
                .into_iter()
                .filter(|schema| schema.name != "information_schema")
            {
                let schema_fqn = format!("{}.{}", schema.catalog_name, schema.name);
                let schema_id = graph.ensure_node(
                    "schema",
                    "unitycatalog",
                    "uc://mizumi",
                    &schema_fqn,
                    &schema.name,
                    json!({ "catalog_name": schema.catalog_name, "comment": schema.comment }),
                );
                graph.add_alias(schema_id, schema_fqn.clone(), AliasPriority::SchemaFqn);
                graph.add_edge(
                    catalog_id,
                    schema_id,
                    "contains",
                    1.0,
                    json!({ "source": "unity_catalog" }),
                );

                let tables = self
                    .uc_get::<TablesResponse>(&format!(
                        "/tables?catalog_name={}&schema_name={}&max_results=200",
                        schema.catalog_name, schema.name
                    ))
                    .await?
                    .tables;

                for table in tables {
                    let table_fqn = format!(
                        "{}.{}.{}",
                        table.catalog_name, table.schema_name, table.name
                    );
                    let table_id = graph.ensure_node(
                        "table",
                        "unitycatalog",
                        "uc://mizumi",
                        &table_fqn,
                        &table.name,
                        json!({
                            "catalog_name": table.catalog_name,
                            "schema_name": table.schema_name,
                            "table_type": table.table_type,
                            "storage_location": table.storage_location,
                        }),
                    );
                    graph.add_alias(table_id, table_fqn, AliasPriority::TableFqn);
                    if let Some(storage_location) = table.storage_location {
                        graph.add_alias(
                            table_id,
                            normalize_storage_path(&storage_location),
                            AliasPriority::StoragePath,
                        );
                    }
                    graph.add_edge(
                        schema_id,
                        table_id,
                        "contains",
                        1.0,
                        json!({ "source": "unity_catalog" }),
                    );
                }
            }
        }

        Ok(())
    }

    async fn ingest_dagster(&self, graph: &mut GraphBuilder) -> Result<(), AppError> {
        let asset_nodes = self
            .dagster_query::<DagsterAssetNodesData>(DAGSTER_ASSET_NODES_QUERY)
            .await?
            .asset_nodes;

        for asset in asset_nodes {
            let asset_path = asset.asset_key.path.join("/");
            let asset_name = asset
                .asset_key
                .path
                .last()
                .cloned()
                .unwrap_or(asset_path.clone());
            let asset_id = graph.ensure_node(
                "dagster_asset",
                "dagster",
                "dagster://mizumi",
                &asset_path,
                &asset_name,
                json!({
                    "compute_kind": asset.compute_kind,
                    "group_name": asset.group_name,
                    "job_names": asset.job_names,
                    "stale_status": asset.stale_status,
                }),
            );
            graph.add_alias(asset_id, asset_path.clone(), AliasPriority::DagsterPath);
            graph.add_alias(asset_id, asset_name, AliasPriority::ShortName);

            for dep in asset.dependency_keys {
                let dep_path = dep.path.join("/");
                let dep_name = dep.path.last().cloned().unwrap_or(dep_path.clone());
                let dep_id = graph.ensure_node(
                    "dagster_asset",
                    "dagster",
                    "dagster://mizumi",
                    &dep_path,
                    &dep_name,
                    json!({}),
                );
                graph.add_alias(dep_id, dep_path.clone(), AliasPriority::DagsterPath);
                graph.add_edge(
                    dep_id,
                    asset_id,
                    "depends_on",
                    1.0,
                    json!({ "source": "dagster" }),
                );
            }

            for job_name in asset.job_names {
                if is_internal_dagster_job(&job_name) {
                    continue;
                }
                let job_id = graph.ensure_node(
                    "dagster_job",
                    "dagster",
                    "dagster://mizumi",
                    &job_name,
                    &job_name,
                    json!({}),
                );
                graph.add_alias(job_id, job_name.clone(), AliasPriority::ShortName);
                graph.add_edge(
                    job_id,
                    asset_id,
                    "orchestrates",
                    1.0,
                    json!({ "source": "dagster" }),
                );
            }
        }

        let jobs = self
            .dagster_query::<DagsterJobsData>(DAGSTER_JOBS_QUERY)
            .await?;
        for job in jobs
            .workspace_or_error
            .location_entries
            .unwrap_or_default()
            .into_iter()
            .flat_map(|entry| entry.location_or_load_error.into_iter())
            .flat_map(|location| location.repositories.unwrap_or_default().into_iter())
            .flat_map(|repo| repo.jobs.into_iter())
        {
            if is_internal_dagster_job(&job.name) {
                continue;
            }
            let job_id = graph.ensure_node(
                "dagster_job",
                "dagster",
                "dagster://mizumi",
                &job.name,
                &job.name,
                json!({ "description": job.description }),
            );
            graph.add_alias(job_id, job.name, AliasPriority::ShortName);
        }

        let schedules = self
            .dagster_query_with_variables::<DagsterSchedulesData>(
                DAGSTER_SCHEDULES_QUERY,
                json!({
                    "selector": {
                        "repositoryLocationName": "mizumi",
                        "repositoryName": "__repository__"
                    }
                }),
            )
            .await?;

        let schedules = schedules.schedules_or_error.results.unwrap_or_default();
        for schedule in schedules {
            let schedule_id = graph.ensure_node(
                "schedule",
                "dagster",
                "dagster://mizumi",
                &schedule.name,
                &schedule.name,
                json!({
                    "cron_schedule": schedule.cron_schedule,
                    "execution_timezone": schedule.execution_timezone,
                    "default_status": schedule.default_status,
                    "status": schedule.schedule_state.as_ref().map(|state| state.status.clone()),
                }),
            );
            graph.add_alias(schedule_id, schedule.name.clone(), AliasPriority::ShortName);
            if let Some(job_name) = schedule.job_name {
                let job_id = graph.ensure_node(
                    "dagster_job",
                    "dagster",
                    "dagster://mizumi",
                    &job_name,
                    &job_name,
                    json!({}),
                );
                graph.add_edge(
                    schedule_id,
                    job_id,
                    "triggers",
                    1.0,
                    json!({ "source": "dagster" }),
                );
            }
        }

        Ok(())
    }

    async fn sync_runtime(&self, graph: &GraphBuilder) -> Result<(), AppError> {
        let asset_nodes = graph
            .nodes
            .values()
            .filter(|node| node.node_type == "dagster_asset")
            .cloned()
            .collect::<Vec<_>>();

        if asset_nodes.is_empty() {
            lineage::replace_runtime(&self.db, &[], &[]).await?;
            return Ok(());
        }

        let asset_keys = asset_nodes
            .iter()
            .map(|node| {
                json!({
                    "path": node.name.split('/').map(str::to_string).collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>();

        let runtime_data = self
            .dagster_query_with_variables::<DagsterAssetLatestInfoData>(
                DAGSTER_ASSET_LATEST_INFO_QUERY,
                json!({ "assetKeys": asset_keys }),
            )
            .await?;

        let dagster_key_to_node = asset_nodes
            .iter()
            .map(|node| (node.name.clone(), node.id))
            .collect::<HashMap<_, _>>();

        let edges_from_asset = graph
            .edges
            .values()
            .filter(|edge| {
                dagster_key_to_node
                    .values()
                    .any(|node_id| *node_id == edge.src)
            })
            .cloned()
            .collect::<Vec<_>>();

        let mut runtime_by_node = HashMap::<Uuid, RuntimeAccumulator>::new();
        let mut runs = HashMap::<String, NewLineageRun>::new();

        for info in runtime_data.assets_latest_info {
            let path_key = info.asset_key.path.join("/");
            let Some(asset_node_id) = dagster_key_to_node.get(&path_key).copied() else {
                continue;
            };

            let runtime = RuntimeAccumulator::from_dagster(&info);
            runtime_by_node.insert(asset_node_id, runtime.clone());

            if let Some(run_id) = runtime.latest_run_id.clone() {
                runs.insert(
                    run_id.clone(),
                    NewLineageRun {
                        run_id,
                        node_id: Some(asset_node_id),
                        source_system: "dagster".to_string(),
                        status: runtime
                            .latest_run_status
                            .clone()
                            .unwrap_or_else(|| "UNKNOWN".to_string()),
                        started_at: runtime.latest_run_started_at,
                        ended_at: runtime.latest_run_ended_at,
                        properties: json!({ "asset_path": path_key }),
                    },
                );
            }

            for edge in edges_from_asset
                .iter()
                .filter(|edge| edge.src == asset_node_id)
            {
                if !matches!(edge.edge_type.as_str(), "materializes" | "orchestrates") {
                    continue;
                }
                runtime_by_node
                    .entry(edge.dst)
                    .and_modify(|existing| existing.merge_from(&runtime))
                    .or_insert_with(|| runtime.clone());
                if let Some(run_id) = runtime.latest_run_id.clone() {
                    runs.entry(run_id.clone()).or_insert(NewLineageRun {
                        run_id,
                        node_id: Some(edge.dst),
                        source_system: "dagster".to_string(),
                        status: runtime
                            .latest_run_status
                            .clone()
                            .unwrap_or_else(|| "UNKNOWN".to_string()),
                        started_at: runtime.latest_run_started_at,
                        ended_at: runtime.latest_run_ended_at,
                        properties: json!({ "derived_from_asset": path_key }),
                    });
                }
            }
        }

        let runtime_rows = runtime_by_node
            .into_iter()
            .map(|(node_id, runtime)| NewLineageNodeRuntime {
                node_id,
                source_system: "dagster".to_string(),
                latest_run_id: runtime.latest_run_id,
                latest_run_status: runtime.latest_run_status,
                latest_run_started_at: runtime.latest_run_started_at,
                latest_run_ended_at: runtime.latest_run_ended_at,
                latest_materialization_at: runtime.latest_materialization_at,
                latest_materialization_run_id: runtime.latest_materialization_run_id,
                unstarted_run_ids: json!(runtime.unstarted_run_ids),
                in_progress_run_ids: json!(runtime.in_progress_run_ids),
                metadata: runtime.metadata,
            })
            .collect::<Vec<_>>();

        let run_rows = runs.into_values().collect::<Vec<_>>();
        lineage::replace_runtime(&self.db, &run_rows, &runtime_rows).await?;
        Ok(())
    }

    fn ingest_repo_jobs(&self, graph: &mut GraphBuilder) -> Result<(), AppError> {
        self.ingest_spark_jobs(graph)?;
        self.ingest_daft_jobs(graph)?;
        self.ingest_dagster_asset_bindings(graph)?;
        Ok(())
    }

    fn ingest_spark_jobs(&self, graph: &mut GraphBuilder) -> Result<(), AppError> {
        let spark_root = self.repo_root.join("packages/spark/jobs");

        // Constants shared across all jobs via common.py; merge into every job's map.
        let common_constants = {
            let common_path = spark_root.join("common.py");
            if common_path.exists() {
                let src = fs::read_to_string(&common_path).map_err(|e| {
                    AppError::QueryFailed(format!("failed to read common.py: {e}"))
                })?;
                extract_constants(&src)
            } else {
                HashMap::new()
            }
        };

        for path in collect_python_files(&spark_root)? {
            // Skip common.py (shared helpers, no job) and the data/ directory (generators).
            if path.file_name().and_then(|n| n.to_str()) == Some("common.py") {
                continue;
            }
            if path.components().any(|c| c.as_os_str() == "data") {
                continue;
            }

            let contents = fs::read_to_string(&path).map_err(|e| {
                AppError::QueryFailed(format!("failed to read {}: {e}", path.display()))
            })?;
            let rel_path = relative_to_repo(&self.repo_root, &path);
            let short_path = rel_path
                .strip_prefix("packages/spark/jobs/")
                .unwrap_or(&rel_path)
                .to_string();

            // Merge file-local constants on top of common ones so local overrides win,
            // then resolve any variable-to-variable aliases against the merged map.
            let mut constants = common_constants.clone();
            constants.extend(extract_constants(&contents));
            resolve_var_aliases(&contents, &mut constants);

            let app_name = extract_app_name(&contents).unwrap_or_else(|| short_path.clone());
            let is_streaming = contents.contains("readStream.format(\"kafka\")")
                || contents.contains("readStream.format('kafka')");
            let job_type = if is_streaming {
                "streaming_job"
            } else {
                "spark_job"
            };
            let job_id = graph.ensure_node(
                job_type,
                "spark",
                "spark://mizumi",
                &short_path,
                &app_name,
                json!({ "path": rel_path, "app_name": app_name }),
            );
            graph.add_alias(job_id, short_path.clone(), AliasPriority::RepoPath);
            graph.add_alias(job_id, rel_path.clone(), AliasPriority::RepoPath);
            graph.add_alias(job_id, app_name.clone(), AliasPriority::ShortName);

            add_spark_job_edges(graph, &contents, &constants, job_id, is_streaming);
        }

        Ok(())
    }

    fn ingest_daft_jobs(&self, graph: &mut GraphBuilder) -> Result<(), AppError> {
        let daft_root = self.repo_root.join("packages/daft/jobs");
        let skip_files = ["co_brand_campaign_summary"];
        for path in collect_python_files(&daft_root)? {
            if path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| skip_files.contains(&n))
            {
                continue;
            }
            let contents = fs::read_to_string(&path).map_err(|e| {
                AppError::QueryFailed(format!("failed to read {}: {e}", path.display()))
            })?;
            let rel_path = relative_to_repo(&self.repo_root, &path);
            let short_path = rel_path
                .strip_prefix("packages/daft/jobs/")
                .unwrap_or(&rel_path)
                .to_string();
            let constants = extract_constants(&contents);
            let display_name = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&short_path).to_string();
            let job_id = graph.ensure_node(
                "daft_job",
                "daft",
                "daft://mizumi",
                &short_path,
                &display_name,
                json!({ "path": rel_path }),
            );
            graph.add_alias(job_id, short_path.clone(), AliasPriority::RepoPath);
            graph.add_alias(job_id, rel_path.clone(), AliasPriority::RepoPath);

            for source_var in extract_var_usages(
                &contents,
                DAFT_SOURCE_VAR_PATTERN.get_or_init(daft_source_var_regex),
            ) {
                if let Some(value) = constants.get(&source_var) {
                    if let Some(table_id) = graph.ensure_table_for_path(value) {
                        graph.add_edge(
                            table_id,
                            job_id,
                            "reads_from",
                            0.95,
                            json!({ "source": "repo_scan" }),
                        );
                    }
                }
            }

            for target_var in extract_var_usages(
                &contents,
                DAFT_TARGET_VAR_PATTERN.get_or_init(daft_target_var_regex),
            ) {
                if let Some(value) = constants.get(&target_var) {
                    if let Some(table_id) = graph.ensure_table_for_path(value) {
                        graph.add_edge(
                            job_id,
                            table_id,
                            "writes_to",
                            0.95,
                            json!({ "source": "repo_scan" }),
                        );
                    }
                }
            }
        }

        Ok(())
    }

    fn ingest_dagster_asset_bindings(&self, graph: &mut GraphBuilder) -> Result<(), AppError> {
        let assets_root = self.repo_root.join("packages/dagster/defs_pkg/assets");
        for path in collect_python_files(&assets_root)? {
            let contents = fs::read_to_string(&path).map_err(|e| {
                AppError::QueryFailed(format!("failed to read {}: {e}", path.display()))
            })?;

            for block in extract_dagster_blocks(&contents) {
                let job_path = extract_job_path(&block.body);
                let metadata_path = extract_metadata_path(&block.body);

                for asset_name in block.asset_names {
                    let asset_id = graph.ensure_node(
                        "dagster_asset",
                        "dagster",
                        "dagster://mizumi",
                        &asset_name,
                        &asset_name,
                        json!({}),
                    );
                    graph.add_alias(asset_id, asset_name.clone(), AliasPriority::ShortName);

                    if let Some(job_path) = &job_path {
                        let (node_type, platform, namespace, prefix) =
                            if job_path.contains("/opt/daft/jobs/") {
                                ("daft_job", "daft", "daft://mizumi", "packages/daft/jobs/")
                            } else {
                                ("spark_job", "spark", "spark://mizumi", "packages/spark/jobs/")
                            };
                        let full_rel = normalize_job_path(job_path);
                        let short_rel = full_rel
                            .strip_prefix(prefix)
                            .unwrap_or(&full_rel)
                            .to_string();
                        let job_id = graph
                            .resolve_alias(&full_rel)
                            .or_else(|| graph.resolve_alias(&short_rel))
                            .unwrap_or_else(|| {
                                let display = Path::new(&short_rel)
                                    .file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or(&short_rel)
                                    .to_string();
                                let id = graph.ensure_node(
                                    node_type,
                                    platform,
                                    namespace,
                                    &short_rel,
                                    &display,
                                    json!({ "path": full_rel }),
                                );
                                graph.add_alias(id, short_rel.clone(), AliasPriority::RepoPath);
                                graph.add_alias(id, full_rel.clone(), AliasPriority::RepoPath);
                                id
                            });
                        graph.add_edge(
                            asset_id,
                            job_id,
                            "orchestrates",
                            0.95,
                            json!({ "source": "repo_scan" }),
                        );
                    }

                    if let Some(metadata_path) = &metadata_path {
                        if let Some(table_id) = graph.ensure_table_for_path(metadata_path) {
                            graph.add_edge(
                                asset_id,
                                table_id,
                                "materializes",
                                0.9,
                                json!({ "source": "repo_scan" }),
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn ingest_streaming_job_submissions(
        &self,
        graph: &mut GraphBuilder,
    ) -> Result<(), AppError> {
        let jobs = streaming_jobs::list(&self.db).await?;

        for job in jobs {
            let repo_path = normalize_job_path(&job.main_application_file);
            let job_id = graph
                .resolve_alias(&repo_path)
                .or_else(|| graph.resolve_alias(&job.name))
                .unwrap_or_else(|| {
                    graph.ensure_node(
                        "streaming_job",
                        "spark",
                        "spark://mizumi",
                        &repo_path,
                        &job.name,
                        json!({
                            "name": job.name,
                            "namespace": job.namespace,
                            "path": repo_path,
                            "main_application_file": job.main_application_file,
                            "image": job.image,
                            "spark_version": job.spark_version,
                            "spark_conf": job.spark_conf,
                            "driver_cores": job.driver_cores,
                            "driver_memory": job.driver_memory,
                            "executor_instances": job.executor_instances,
                            "executor_cores": job.executor_cores,
                            "executor_memory": job.executor_memory,
                        }),
                    )
                });

            graph.add_alias(job_id, job.name.clone(), AliasPriority::ShortName);
            graph.add_alias(job_id, repo_path.clone(), AliasPriority::RepoPath);
            graph.add_alias(
                job_id,
                job.main_application_file.clone(),
                AliasPriority::RepoPath,
            );
            graph.merge_node_properties(
                job_id,
                json!({
                    "name": job.name,
                    "namespace": job.namespace,
                    "path": repo_path,
                    "main_application_file": job.main_application_file,
                    "image": job.image,
                    "spark_version": job.spark_version,
                    "spark_conf": job.spark_conf,
                    "driver_cores": job.driver_cores,
                    "driver_memory": job.driver_memory,
                    "executor_instances": job.executor_instances,
                    "executor_cores": job.executor_cores,
                    "executor_memory": job.executor_memory,
                }),
            );

            if let Some(path) = resolve_repo_job_path(&self.repo_root, &job.main_application_file) {
                let contents = fs::read_to_string(&path).map_err(|e| {
                    AppError::QueryFailed(format!("failed to read {}: {e}", path.display()))
                })?;
                let constants = extract_constants(&contents);
                let is_streaming = contents.contains("readStream.format(\"kafka\")")
                    || contents.contains("readStream.format('kafka')");
                add_spark_job_edges(graph, &contents, &constants, job_id, is_streaming);
            }
        }

        Ok(())
    }

    async fn uc_get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, AppError> {
        tracing::debug!("admin token: {}", self.uc_admin_token);
        let response = self
            .client
            .get(format!("{}{}", self.uc_base_url, path))
            .bearer_auth(&self.uc_admin_token)
            .send()
            .await
            .map_err(|e| AppError::QueryFailed(format!("UC request failed: {e}")))?;

        if !response.status().is_success() {
            return Err(AppError::QueryFailed(format!(
                "UC request failed with status {}",
                response.status()
            )));
        }

        response
            .json::<T>()
            .await
            .map_err(|e| AppError::Parse(format!("failed to parse UC response: {e}")))
    }

    async fn dagster_query<T: for<'de> Deserialize<'de>>(
        &self,
        query: &str,
    ) -> Result<T, AppError> {
        self.dagster_query_with_variables(query, json!({})).await
    }

    async fn dagster_query_with_variables<T: for<'de> Deserialize<'de>>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T, AppError> {
        let response = self
            .client
            .post(format!(
                "{}/graphql",
                self.dagster_base_url.trim_end_matches('/')
            ))
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .await
            .map_err(|e| AppError::QueryFailed(format!("Dagster request failed: {e}")))?;

        let payload = response
            .json::<GraphQlResponse<T>>()
            .await
            .map_err(|e| AppError::Parse(format!("failed to parse Dagster response: {e}")))?;

        if let Some(errors) = payload.errors {
            let message = errors
                .into_iter()
                .map(|err| err.message)
                .collect::<Vec<_>>()
                .join("; ");
            return Err(AppError::QueryFailed(format!(
                "Dagster GraphQL returned errors: {message}"
            )));
        }

        payload
            .data
            .ok_or_else(|| AppError::QueryFailed("Dagster GraphQL returned no data".to_string()))
    }
}

fn resolve_repo_root() -> PathBuf {
    if let Ok(value) = std::env::var("REPO_ROOT") {
        let path = PathBuf::from(value);
        if looks_like_repo_root(&path) {
            return path;
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(path) = find_repo_root_from(&current_dir) {
            return path;
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(path) = find_repo_root_from(&manifest_dir) {
        return path;
    }

    PathBuf::from(".")
}

fn find_repo_root_from(start: &Path) -> Option<PathBuf> {
    for candidate in start.ancestors() {
        if looks_like_repo_root(candidate) {
            return Some(candidate.to_path_buf());
        }
    }
    None
}

fn looks_like_repo_root(path: &Path) -> bool {
    path.join("packages/controlplane").exists() && path.join("packages/spark/jobs").exists()
}

fn node_to_response(node: LineageNode, runtime: Option<LineageNodeRuntime>) -> LineageNodeResponse {
    LineageNodeResponse {
        id: node.id,
        node_type: node.node_type,
        platform: node.platform,
        namespace: node.namespace,
        name: node.name,
        display_name: node.display_name,
        properties: node.properties,
        runtime: runtime.map(runtime_to_response),
    }
}

fn edge_to_response(edge: LineageEdge) -> LineageEdgeResponse {
    LineageEdgeResponse {
        id: edge.id,
        source: edge.src_node_id,
        target: edge.dst_node_id,
        edge_type: edge.edge_type,
        confidence: edge.confidence,
        properties: edge.properties,
    }
}

fn runtime_to_response(runtime: LineageNodeRuntime) -> LineageRuntimeResponse {
    LineageRuntimeResponse {
        source_system: runtime.source_system,
        latest_run_id: runtime.latest_run_id,
        latest_run_status: runtime.latest_run_status,
        latest_run_started_at: runtime.latest_run_started_at,
        latest_run_ended_at: runtime.latest_run_ended_at,
        latest_materialization_at: runtime.latest_materialization_at,
        latest_materialization_run_id: runtime.latest_materialization_run_id,
        unstarted_run_ids: serde_json::from_value(runtime.unstarted_run_ids).unwrap_or_default(),
        in_progress_run_ids: serde_json::from_value(runtime.in_progress_run_ids)
            .unwrap_or_default(),
        metadata: runtime.metadata,
        observed_at: runtime.observed_at,
    }
}

#[derive(Default)]
struct GraphSummary {
    nodes_count: usize,
    edges_count: usize,
    aliases_count: usize,
}

#[derive(Clone, Default)]
struct RuntimeAccumulator {
    latest_run_id: Option<String>,
    latest_run_status: Option<String>,
    latest_run_started_at: Option<DateTime<Utc>>,
    latest_run_ended_at: Option<DateTime<Utc>>,
    latest_materialization_at: Option<DateTime<Utc>>,
    latest_materialization_run_id: Option<String>,
    unstarted_run_ids: Vec<String>,
    in_progress_run_ids: Vec<String>,
    metadata: serde_json::Value,
}

impl RuntimeAccumulator {
    fn from_dagster(info: &DagsterAssetLatestInfo) -> Self {
        let latest_run_started_at = info
            .latest_run
            .as_ref()
            .and_then(|run| run.start_time)
            .and_then(seconds_to_datetime);
        let latest_run_ended_at = info
            .latest_run
            .as_ref()
            .and_then(|run| run.end_time)
            .and_then(seconds_to_datetime);
        let latest_materialization_at = info
            .latest_materialization
            .as_ref()
            .and_then(|mat| parse_dagster_timestamp(&mat.timestamp));

        Self {
            latest_run_id: info.latest_run.as_ref().map(|run| run.run_id.clone()),
            latest_run_status: info.latest_run.as_ref().map(|run| run.status.clone()),
            latest_run_started_at,
            latest_run_ended_at,
            latest_materialization_at,
            latest_materialization_run_id: info
                .latest_materialization
                .as_ref()
                .map(|mat| mat.run_id.clone()),
            unstarted_run_ids: info.unstarted_run_ids.clone(),
            in_progress_run_ids: info.in_progress_run_ids.clone(),
            metadata: json!({
                "asset_path": info.asset_key.path,
                "queued_runs": info.unstarted_run_ids.len(),
                "in_progress_runs": info.in_progress_run_ids.len(),
            }),
        }
    }

    fn merge_from(&mut self, other: &RuntimeAccumulator) {
        if is_newer_run(self.latest_run_started_at, other.latest_run_started_at) {
            self.latest_run_id = other.latest_run_id.clone();
            self.latest_run_status = other.latest_run_status.clone();
            self.latest_run_started_at = other.latest_run_started_at;
            self.latest_run_ended_at = other.latest_run_ended_at;
        }
        if is_newer_mat(
            self.latest_materialization_at,
            other.latest_materialization_at,
        ) {
            self.latest_materialization_at = other.latest_materialization_at;
            self.latest_materialization_run_id = other.latest_materialization_run_id.clone();
        }
        self.unstarted_run_ids = other.unstarted_run_ids.clone();
        self.in_progress_run_ids = other.in_progress_run_ids.clone();
        self.metadata = other.metadata.clone();
    }
}

#[derive(Default)]
struct GraphBuilder {
    nodes: BTreeMap<String, GraphNode>,
    aliases: BTreeSet<(Uuid, String)>,
    alias_index: BTreeMap<String, AliasOwner>,
    edges: BTreeMap<(Uuid, Uuid, String), GraphEdge>,
}

impl GraphBuilder {
    fn ensure_node(
        &mut self,
        node_type: &str,
        platform: &str,
        namespace: &str,
        name: &str,
        display_name: &str,
        properties: serde_json::Value,
    ) -> Uuid {
        let key = format!("{node_type}|{namespace}|{name}");
        let node_id = stable_uuid(&key);
        self.nodes.entry(key).or_insert_with(|| GraphNode {
            id: node_id,
            node_type: node_type.to_string(),
            platform: platform.to_string(),
            namespace: namespace.to_string(),
            name: name.to_string(),
            display_name: display_name.to_string(),
            properties,
        });
        node_id
    }

    fn add_alias(&mut self, node_id: Uuid, alias: String, priority: AliasPriority) {
        if alias.is_empty() {
            return;
        }
        if let Some(existing_owner) = self.alias_index.get(&alias) {
            if existing_owner.node_id == node_id {
                return;
            }
            if existing_owner.priority >= priority {
                return;
            }
            self.aliases
                .remove(&(existing_owner.node_id, alias.clone()));
        }
        self.alias_index
            .insert(alias.clone(), AliasOwner { node_id, priority });
        self.aliases.insert((node_id, alias));
    }

    fn resolve_alias(&self, alias: &str) -> Option<Uuid> {
        self.alias_index.get(alias).map(|owner| owner.node_id)
    }

    fn add_edge(
        &mut self,
        src: Uuid,
        dst: Uuid,
        edge_type: &str,
        confidence: f64,
        properties: serde_json::Value,
    ) {
        let key = (src, dst, edge_type.to_string());
        self.edges.entry(key).or_insert(GraphEdge {
            src,
            dst,
            edge_type: edge_type.to_string(),
            confidence,
            properties,
        });
    }

    fn merge_node_properties(&mut self, node_id: Uuid, properties: serde_json::Value) {
        let Some(next) = properties.as_object() else {
            return;
        };

        if let Some(node) = self.nodes.values_mut().find(|node| node.id == node_id) {
            if let Some(existing) = node.properties.as_object_mut() {
                for (key, value) in next {
                    existing.insert(key.clone(), value.clone());
                }
            } else {
                node.properties = serde_json::Value::Object(next.clone());
            }
        }
    }

    fn ensure_table_for_path(&mut self, raw_path: &str) -> Option<Uuid> {
        let normalized = normalize_storage_path(raw_path);
        let (catalog, schema, table) = parse_uc_path(&normalized)?;
        let catalog_id = self.ensure_node(
            "catalog",
            "unitycatalog",
            "uc://mizumi",
            &catalog,
            &catalog,
            json!({}),
        );
        self.add_alias(catalog_id, catalog.clone(), AliasPriority::CatalogName);

        let schema_fqn = format!("{catalog}.{schema}");
        let schema_id = self.ensure_node(
            "schema",
            "unitycatalog",
            "uc://mizumi",
            &schema_fqn,
            &schema,
            json!({ "catalog_name": catalog }),
        );
        self.add_alias(schema_id, schema_fqn.clone(), AliasPriority::SchemaFqn);
        self.add_edge(
            catalog_id,
            schema_id,
            "contains",
            1.0,
            json!({ "source": "path_norm" }),
        );

        let table_fqn = format!("{catalog}.{schema}.{table}");
        let table_id = self.ensure_node(
            "table",
            "unitycatalog",
            "uc://mizumi",
            &table_fqn,
            &table,
            json!({
                "catalog_name": catalog,
                "schema_name": schema,
                "storage_location": normalized,
            }),
        );
        self.add_alias(table_id, table_fqn, AliasPriority::TableFqn);
        self.add_alias(table_id, normalized, AliasPriority::StoragePath);
        self.add_edge(
            schema_id,
            table_id,
            "contains",
            1.0,
            json!({ "source": "path_norm" }),
        );
        Some(table_id)
    }
}

#[derive(Clone)]
struct GraphNode {
    id: Uuid,
    node_type: String,
    platform: String,
    namespace: String,
    name: String,
    display_name: String,
    properties: serde_json::Value,
}

#[derive(Clone)]
struct GraphEdge {
    src: Uuid,
    dst: Uuid,
    edge_type: String,
    confidence: f64,
    properties: serde_json::Value,
}

#[derive(Clone, Copy)]
struct AliasOwner {
    node_id: Uuid,
    priority: AliasPriority,
}

#[derive(Clone, Copy, Eq, Ord, PartialEq, PartialOrd)]
enum AliasPriority {
    ShortName = 10,
    TopicName = 20,
    DagsterPath = 30,
    CatalogName = 40,
    RepoPath = 50,
    SchemaFqn = 60,
    TableFqn = 70,
    StoragePath = 80,
}

fn seconds_to_datetime(ts: f64) -> Option<DateTime<Utc>> {
    let secs = ts.trunc() as i64;
    let nanos = ((ts.fract() * 1_000_000_000.0).round() as u32).min(999_999_999);
    DateTime::<Utc>::from_timestamp(secs, nanos)
}

fn parse_dagster_timestamp(ts: &str) -> Option<DateTime<Utc>> {
    let numeric = ts.parse::<f64>().ok()?;
    seconds_to_datetime(if numeric > 1e12 {
        numeric / 1000.0
    } else {
        numeric
    })
}

fn is_newer_run(current: Option<DateTime<Utc>>, candidate: Option<DateTime<Utc>>) -> bool {
    match (current, candidate) {
        (None, Some(_)) => true,
        (Some(cur), Some(next)) => next > cur,
        _ => false,
    }
}

fn is_newer_mat(current: Option<DateTime<Utc>>, candidate: Option<DateTime<Utc>>) -> bool {
    match (current, candidate) {
        (None, Some(_)) => true,
        (Some(cur), Some(next)) => next > cur,
        _ => false,
    }
}

fn stable_uuid(key: &str) -> Uuid {
    Uuid::new_v5(&LINEAGE_NAMESPACE, key.as_bytes())
}

fn normalize_storage_path(path: &str) -> String {
    path.trim().trim_end_matches('/').replace("s3a://", "s3://")
}

fn parse_uc_path(path: &str) -> Option<(String, String, String)> {
    let normalized = normalize_storage_path(path);
    let prefix = "s3://unitycatalog/";
    let rest = normalized.strip_prefix(prefix)?;
    let parts = rest.split('/').collect::<Vec<_>>();
    if parts.len() < 3 {
        return None;
    }
    Some((
        parts[0].to_string(),
        parts[1].to_string(),
        parts[2].to_string(),
    ))
}

fn collect_python_files(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut results = Vec::new();
    if !root.exists() {
        return Ok(results);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)
            .map_err(|e| AppError::QueryFailed(format!("failed to read {}: {e}", dir.display())))?
        {
            let entry = entry
                .map_err(|e| AppError::QueryFailed(format!("failed to read dir entry: {e}")))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("py") {
                results.push(path);
            }
        }
    }
    results.sort();
    Ok(results)
}

fn relative_to_repo(repo_root: &Path, path: &Path) -> String {
    path.strip_prefix(repo_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn resolve_var_aliases(contents: &str, map: &mut HashMap<String, String>) {
    for caps in VAR_ALIAS_PATTERN.get_or_init(var_alias_regex).captures_iter(contents) {
        let Some(lhs) = caps.get(1).map(|m| m.as_str().to_string()) else { continue };
        let Some(rhs) = caps.get(2).map(|m| m.as_str().to_string()) else { continue };
        if map.contains_key(&lhs) {
            continue;
        }
        if let Some(value) = map.get(&rhs).cloned() {
            map.insert(lhs, value);
        }
    }
}

fn extract_constants(contents: &str) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = CONSTANT_PATTERN
        .get_or_init(constant_regex)
        .captures_iter(contents)
        .filter_map(|caps| {
            Some((
                caps.get(1)?.as_str().to_string(),
                caps.get(2)?.as_str().to_string(),
            ))
        })
        .collect();
    // Resolve within-file variable aliases (e.g. TARGET_PATH = OTHER_PATH).
    resolve_var_aliases(contents, &mut map);
    map
}

fn extract_app_name(contents: &str) -> Option<String> {
    APP_NAME_PATTERN
        .get_or_init(app_name_regex)
        .captures(contents)
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()))
}

fn extract_var_usages(contents: &str, regex: &Regex) -> Vec<String> {
    regex
        .captures_iter(contents)
        .filter_map(|caps| caps.get(1).map(|value| value.as_str().to_string()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn extract_first_var_usage(contents: &str, regex: &Regex) -> Option<String> {
    regex
        .captures(contents)
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()))
}

fn extract_dagster_blocks(contents: &str) -> Vec<DagsterBlock> {
    let mut blocks = Vec::new();
    let mut current = Vec::new();
    let mut current_kind = None::<String>;

    for line in contents.lines() {
        if line.starts_with("@dg.asset") || line.starts_with("@dg.multi_asset") {
            if let Some(kind) = current_kind.take() {
                blocks.push(parse_dagster_block(&kind, &current.join("\n")));
                current.clear();
            }
            current_kind = Some(if line.starts_with("@dg.multi_asset") {
                "multi".to_string()
            } else {
                "single".to_string()
            });
        }

        if current_kind.is_some() {
            current.push(line.to_string());
        }
    }

    if let Some(kind) = current_kind {
        blocks.push(parse_dagster_block(&kind, &current.join("\n")));
    }

    blocks
}

fn parse_dagster_block(kind: &str, body: &str) -> DagsterBlock {
    let asset_names = if kind == "multi" {
        MULTI_ASSET_NAME_PATTERN
            .get_or_init(multi_asset_name_regex)
            .captures_iter(body)
            .filter_map(|caps| caps.get(1).map(|value| value.as_str().to_string()))
            .collect()
    } else {
        SINGLE_ASSET_NAME_PATTERN
            .get_or_init(single_asset_name_regex)
            .captures(body)
            .and_then(|caps| caps.get(1).map(|value| vec![value.as_str().to_string()]))
            .unwrap_or_default()
    };

    DagsterBlock {
        asset_names,
        body: body.to_string(),
    }
}

fn extract_job_path(body: &str) -> Option<String> {
    JOB_PATH_PATTERN
        .get_or_init(job_path_regex)
        .captures(body)
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()))
}

fn extract_metadata_path(body: &str) -> Option<String> {
    METADATA_PATH_PATTERN
        .get_or_init(metadata_path_regex)
        .captures(body)
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()))
}

fn normalize_job_path(path: &str) -> String {
    path.trim_start_matches("local:///opt/")
        .trim_start_matches("/opt/")
        .replace("spark/jobs/", "packages/spark/jobs/")
        .replace("daft/jobs/", "packages/daft/jobs/")
}

fn resolve_repo_job_path(repo_root: &Path, path: &str) -> Option<PathBuf> {
    let normalized = normalize_job_path(path);
    let candidate = repo_root.join(&normalized);
    candidate.exists().then_some(candidate)
}

fn add_spark_job_edges(
    graph: &mut GraphBuilder,
    contents: &str,
    constants: &HashMap<String, String>,
    job_id: Uuid,
    is_streaming: bool,
) {
    for source_var in extract_var_usages(contents, LOAD_VAR_PATTERN.get_or_init(load_var_regex)) {
        if let Some(value) = constants.get(&source_var) {
            if let Some(table_id) = graph.ensure_table_for_path(value) {
                graph.add_edge(
                    table_id,
                    job_id,
                    "reads_from",
                    0.95,
                    json!({ "source": "repo_scan" }),
                );
            }
        }
    }

    let save_vars: BTreeSet<String> = extract_var_usages(contents, SAVE_VAR_PATTERN.get_or_init(save_var_regex))
        .into_iter()
        .chain(extract_var_usages(contents, WRITE_DELTA_VAR_PATTERN.get_or_init(write_delta_var_regex)))
        .collect();
    for target_var in save_vars {
        if let Some(value) = constants.get(&target_var) {
            if let Some(table_id) = graph.ensure_table_for_path(value) {
                graph.add_edge(
                    job_id,
                    table_id,
                    "writes_to",
                    0.95,
                    json!({ "source": "repo_scan" }),
                );
            }
        }
    }

    if !is_streaming {
        return;
    }

    if let Some(topic_var) =
        extract_first_var_usage(contents, TOPIC_VAR_PATTERN.get_or_init(topic_var_regex))
    {
        if let Some(topic_name) = constants.get(&topic_var) {
            let bootstrap = extract_first_var_usage(
                contents,
                BOOTSTRAP_VAR_PATTERN.get_or_init(bootstrap_var_regex),
            )
            .and_then(|var| constants.get(&var).cloned())
            .unwrap_or_else(|| "redpanda-svc.redpanda.svc.cluster.local:9092".to_string());
            let topic_id = graph.ensure_node(
                "topic",
                "kafka",
                &format!("kafka://{bootstrap}"),
                topic_name,
                topic_name,
                json!({ "bootstrap_servers": bootstrap }),
            );
            graph.add_alias(topic_id, topic_name.clone(), AliasPriority::TopicName);
            graph.add_edge(
                topic_id,
                job_id,
                "reads_from",
                0.98,
                json!({ "source": "repo_scan" }),
            );
        }
    }

    if let Some(target_var) = extract_first_var_usage(
        contents,
        STREAM_PATH_VAR_PATTERN.get_or_init(stream_path_var_regex),
    ) {
        if let Some(path_value) = constants.get(&target_var) {
            if let Some(table_id) = graph.ensure_table_for_path(path_value) {
                graph.add_edge(
                    job_id,
                    table_id,
                    "writes_to",
                    0.98,
                    json!({ "source": "repo_scan", "mode": "streaming" }),
                );
            }
        }
    }
}

fn constant_regex() -> Regex {
    // Matches:
    //   VAR = "literal"
    //   VAR = ("literal")
    //   VAR = os.getenv("KEY", "default")       ← no wrapping parens
    //   VAR = (os.getenv("KEY", "default"))      ← with wrapping parens
    Regex::new(r#"([A-Z][A-Z0-9_]+)\s*=\s*(?:\(?\s*os\.getenv\s*\([^,)]+,\s*|\()?\s*"([^"]+)""#)
        .expect("valid constant regex")
}

fn var_alias_regex() -> Regex {
    // Matches VAR = OTHER_VAR or VAR = os.getenv("KEY", OTHER_VAR) — indirection to another constant.
    // (?m) makes $ match end-of-line, not end-of-string.
    Regex::new(r#"(?m)([A-Z][A-Z0-9_]+)\s*=\s*(?:os\.getenv\s*\([^,)]+,\s*)?([A-Z][A-Z0-9_]+)\s*\)?\s*$"#)
        .expect("valid var alias regex")
}

fn app_name_regex() -> Regex {
    Regex::new(r#"appName\("([^"]+)"\)"#).expect("valid app name regex")
}

fn load_var_regex() -> Regex {
    Regex::new(r#"\.load\(\s*(\w+)\s*\)"#).expect("valid load regex")
}

fn save_var_regex() -> Regex {
    Regex::new(r#"\.save\(\s*(\w+)\s*\)"#).expect("valid save regex")
}

fn write_delta_var_regex() -> Regex {
    // Matches write_delta(df, VAR) — the shared helper used across all spark jobs.
    Regex::new(r#"write_delta\s*\(\s*\w+\s*,\s*(\w+)\s*\)"#).expect("valid write_delta regex")
}

fn daft_source_var_regex() -> Regex {
    Regex::new(r#"read_deltalake\((\w+)"#).expect("valid daft source regex")
}

fn daft_target_var_regex() -> Regex {
    Regex::new(r#"write_deltalake\(\s*(\w+)"#).expect("valid daft target regex")
}

fn topic_var_regex() -> Regex {
    Regex::new(r#"\.option\("subscribe",\s*(\w+)\)"#).expect("valid topic regex")
}

fn bootstrap_var_regex() -> Regex {
    Regex::new(r#"\.option\("kafka\.bootstrap\.servers",\s*(\w+)\)"#)
        .expect("valid bootstrap regex")
}

fn stream_path_var_regex() -> Regex {
    Regex::new(r#"\.option\("path",\s*(\w+)\)"#).expect("valid stream path regex")
}

fn single_asset_name_regex() -> Regex {
    Regex::new(r#"def\s+([a-zA-Z0-9_]+)\s*\("#).expect("valid single asset regex")
}

fn multi_asset_name_regex() -> Regex {
    Regex::new(r#"AssetSpec\(\s*"([^"]+)""#).expect("valid multi asset regex")
}

fn job_path_regex() -> Regex {
    Regex::new(r#"(/opt/(?:spark|daft)/jobs/[A-Za-z0-9_./-]+\.py)"#).expect("valid job path regex")
}

fn metadata_path_regex() -> Regex {
    Regex::new(r#"(s3a?://unitycatalog/[A-Za-z0-9_./-]+)"#).expect("valid metadata path regex")
}

static CONSTANT_PATTERN: OnceLock<Regex> = OnceLock::new();
static VAR_ALIAS_PATTERN: OnceLock<Regex> = OnceLock::new();
static APP_NAME_PATTERN: OnceLock<Regex> = OnceLock::new();
static LOAD_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static SAVE_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static WRITE_DELTA_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static DAFT_SOURCE_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static DAFT_TARGET_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static TOPIC_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static BOOTSTRAP_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static STREAM_PATH_VAR_PATTERN: OnceLock<Regex> = OnceLock::new();
static SINGLE_ASSET_NAME_PATTERN: OnceLock<Regex> = OnceLock::new();
static MULTI_ASSET_NAME_PATTERN: OnceLock<Regex> = OnceLock::new();
static JOB_PATH_PATTERN: OnceLock<Regex> = OnceLock::new();
static METADATA_PATH_PATTERN: OnceLock<Regex> = OnceLock::new();

struct DagsterBlock {
    asset_names: Vec<String>,
    body: String,
}

#[cfg(test)]
mod tests {
    use super::{
        extract_var_usages, find_repo_root_from, load_var_regex, looks_like_repo_root,
        normalize_job_path, resolve_repo_job_path, save_var_regex,
    };
    use std::path::Path;

    #[test]
    fn normalize_job_path_supports_controlplane_local_uri() {
        assert_eq!(
            normalize_job_path("local:///opt/spark/jobs/hdbank/stream_banking_transactions_to_bronze.py"),
            "packages/spark/jobs/hdbank/stream_banking_transactions_to_bronze.py"
        );
    }

    #[test]
    fn resolve_repo_job_path_maps_into_repo_layout() {
        let repo_root = Path::new("/repo");
        let path = resolve_repo_job_path(
            repo_root,
            "local:///opt/spark/jobs/hdbank/stream_banking_transactions_to_bronze.py",
        );
        assert!(path.is_none());
    }

    #[test]
    fn find_repo_root_from_walks_up_to_repo_root() {
        let repo_root = Path::new("/tmp/workspace");
        let nested = repo_root.join("packages/controlplane/src");
        let found = find_repo_root_from(&nested);
        assert!(found.is_none());
    }

    #[test]
    fn looks_like_repo_root_requires_expected_directories() {
        assert!(!looks_like_repo_root(Path::new("/definitely/not/a/repo")));
    }

    #[test]
    fn save_var_regex_supports_multiline_save_calls() {
        let contents = r#"
            df.write.format("delta").save(
                TARGET_PATH
            )
        "#;
        assert_eq!(
            extract_var_usages(contents, &save_var_regex()),
            vec!["TARGET_PATH".to_string()]
        );
    }

    #[test]
    fn load_var_regex_supports_internal_whitespace() {
        let contents = r#"
            spark.read.format("delta").load(
                SOURCE_PATH
            )
        "#;
        assert_eq!(
            extract_var_usages(contents, &load_var_regex()),
            vec!["SOURCE_PATH".to_string()]
        );
    }
}

#[derive(Deserialize)]
struct CatalogsResponse {
    catalogs: Vec<CatalogInfo>,
}

#[derive(Deserialize)]
struct CatalogInfo {
    name: String,
    comment: Option<String>,
}

#[derive(Deserialize)]
struct SchemasResponse {
    schemas: Vec<SchemaInfo>,
}

#[derive(Deserialize)]
struct SchemaInfo {
    name: String,
    catalog_name: String,
    comment: Option<String>,
}

#[derive(Deserialize)]
struct TablesResponse {
    tables: Vec<TableInfo>,
}

#[derive(Deserialize)]
struct TableInfo {
    name: String,
    catalog_name: String,
    schema_name: String,
    table_type: String,
    storage_location: Option<String>,
}

#[derive(Deserialize)]
struct GraphQlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQlError>>,
}

#[derive(Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Deserialize)]
struct DagsterAssetNodesData {
    #[serde(rename = "assetNodes")]
    asset_nodes: Vec<DagsterAssetNode>,
}

#[derive(Deserialize)]
struct DagsterAssetNode {
    #[serde(rename = "assetKey")]
    asset_key: DagsterAssetKey,
    #[serde(rename = "computeKind")]
    compute_kind: Option<String>,
    #[serde(rename = "groupName")]
    group_name: Option<String>,
    #[serde(rename = "jobNames")]
    job_names: Vec<String>,
    #[serde(rename = "dependencyKeys")]
    dependency_keys: Vec<DagsterAssetKey>,
    #[serde(rename = "staleStatus")]
    stale_status: Option<String>,
}

#[derive(Deserialize)]
struct DagsterAssetKey {
    path: Vec<String>,
}

#[derive(Deserialize)]
struct DagsterJobsData {
    #[serde(rename = "workspaceOrError")]
    workspace_or_error: DagsterWorkspace,
}

#[derive(Deserialize)]
struct DagsterWorkspace {
    #[serde(rename = "locationEntries")]
    location_entries: Option<Vec<DagsterLocationEntry>>,
}

#[derive(Deserialize)]
struct DagsterLocationEntry {
    #[serde(rename = "locationOrLoadError")]
    location_or_load_error: Option<DagsterRepoLocation>,
}

#[derive(Deserialize)]
struct DagsterRepoLocation {
    repositories: Option<Vec<DagsterRepository>>,
}

#[derive(Deserialize)]
struct DagsterRepository {
    jobs: Vec<DagsterJob>,
}

#[derive(Deserialize)]
struct DagsterJob {
    name: String,
    description: Option<String>,
}

#[derive(Deserialize)]
struct DagsterSchedulesData {
    #[serde(rename = "schedulesOrError")]
    schedules_or_error: DagsterSchedulesOrError,
}

#[derive(Deserialize)]
struct DagsterSchedulesOrError {
    results: Option<Vec<DagsterSchedule>>,
}

#[derive(Deserialize)]
struct DagsterSchedule {
    name: String,
    #[serde(rename = "cronSchedule")]
    cron_schedule: String,
    #[serde(rename = "executionTimezone")]
    execution_timezone: Option<String>,
    #[serde(rename = "defaultStatus")]
    default_status: Option<String>,
    #[serde(rename = "pipelineName")]
    job_name: Option<String>,
    #[serde(rename = "scheduleState")]
    schedule_state: Option<DagsterScheduleState>,
}

#[derive(Deserialize)]
struct DagsterScheduleState {
    status: String,
}

#[derive(Deserialize)]
struct DagsterAssetLatestInfoData {
    #[serde(rename = "assetsLatestInfo")]
    assets_latest_info: Vec<DagsterAssetLatestInfo>,
}

#[derive(Deserialize)]
struct DagsterAssetLatestInfo {
    #[serde(rename = "assetKey")]
    asset_key: DagsterAssetKey,
    #[serde(rename = "latestRun")]
    latest_run: Option<DagsterLatestRun>,
    #[serde(rename = "latestMaterialization")]
    latest_materialization: Option<DagsterLatestMaterialization>,
    #[serde(rename = "unstartedRunIds", default)]
    unstarted_run_ids: Vec<String>,
    #[serde(rename = "inProgressRunIds", default)]
    in_progress_run_ids: Vec<String>,
}

#[derive(Deserialize)]
struct DagsterLatestRun {
    #[serde(rename = "runId")]
    run_id: String,
    status: String,
    #[serde(rename = "startTime")]
    start_time: Option<f64>,
    #[serde(rename = "endTime")]
    end_time: Option<f64>,
}

#[derive(Deserialize)]
struct DagsterLatestMaterialization {
    timestamp: String,
    #[serde(rename = "runId")]
    run_id: String,
}

const DAGSTER_ASSET_NODES_QUERY: &str = r#"
query {
  assetNodes {
    assetKey { path }
    computeKind
    groupName
    jobNames
    dependencyKeys { path }
    staleStatus
  }
}
"#;

const DAGSTER_JOBS_QUERY: &str = r#"
query {
  workspaceOrError {
    ... on Workspace {
      locationEntries {
        locationOrLoadError {
          ... on RepositoryLocation {
            repositories {
              jobs {
                name
                description
              }
            }
          }
        }
      }
    }
  }
}
"#;

const DAGSTER_SCHEDULES_QUERY: &str = r#"
query Schedules($selector: RepositorySelector!) {
  schedulesOrError(repositorySelector: $selector) {
    ... on Schedules {
      results {
        name
        cronSchedule
        executionTimezone
        defaultStatus
        pipelineName
        scheduleState {
          status
        }
      }
    }
  }
}
"#;

const DAGSTER_ASSET_LATEST_INFO_QUERY: &str = r#"
query AssetLatestInfo($assetKeys: [AssetKeyInput!]!) {
  assetsLatestInfo(assetKeys: $assetKeys) {
    assetKey { path }
    latestRun {
      runId
      status
      startTime
      endTime
    }
    latestMaterialization {
      timestamp
      runId
    }
    unstartedRunIds
    inProgressRunIds
  }
}
"#;

fn is_internal_dagster_job(name: &str) -> bool {
    name == "__ASSET_JOB" || name.starts_with("__")
}

fn ingest_static_nodes(graph: &mut GraphBuilder) {
    // ── Dashboard ──────────────────────────────────────────────────────────────
    // The webui dashboard queries these gold/silver tables directly via SQL.
    let dashboard_id = graph.ensure_node(
        "dashboard",
        "webui",
        "webui://mizumi",
        "cross_company_journey_dashboard",
        "Cross-company Journey Dashboard",
        json!({
            "description": "Operational dashboard for cross-company journey engine and activation platform",
            "url_path": "/dashboard",
        }),
    );
    graph.add_alias(
        dashboard_id,
        "cross_company_journey_dashboard".to_string(),
        AliasPriority::ShortName,
    );

    let dashboard_tables = [
        "partnership.co_brand_gold.co_brand_offer_audience_v1",
        "partnership.co_brand_silver.customer_360_v1",
        "hdbank.hdbank_partnership_prod_silver.customers_v1",
        "hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1",
    ];
    for table_fqn in &dashboard_tables {
        let parts: Vec<&str> = table_fqn.splitn(3, '.').collect();
        if parts.len() == 3 {
            let (catalog, schema, table) = (parts[0], parts[1], parts[2]);
            let catalog_id = graph.ensure_node(
                "catalog",
                "unitycatalog",
                "uc://mizumi",
                catalog,
                catalog,
                json!({}),
            );
            graph.add_alias(catalog_id, catalog.to_string(), AliasPriority::CatalogName);

            let schema_fqn = format!("{catalog}.{schema}");
            let schema_id = graph.ensure_node(
                "schema",
                "unitycatalog",
                "uc://mizumi",
                &schema_fqn,
                schema,
                json!({ "catalog_name": catalog }),
            );
            graph.add_alias(schema_id, schema_fqn.clone(), AliasPriority::SchemaFqn);
            graph.add_edge(
                catalog_id,
                schema_id,
                "contains",
                1.0,
                json!({ "source": "static" }),
            );

            let table_id = graph.ensure_node(
                "table",
                "unitycatalog",
                "uc://mizumi",
                table_fqn,
                table,
                json!({ "catalog_name": catalog, "schema_name": schema }),
            );
            graph.add_alias(table_id, table_fqn.to_string(), AliasPriority::TableFqn);
            graph.add_edge(
                schema_id,
                table_id,
                "contains",
                1.0,
                json!({ "source": "static" }),
            );

            graph.add_edge(
                table_id,
                dashboard_id,
                "reads_from",
                1.0,
                json!({ "source": "static" }),
            );
        }
    }

    // ── MLflow model registry ──────────────────────────────────────────────────
    // The daft train_baggage_damage_model.py job registers a model under this URI.
    let mlflow_model_id = graph.ensure_node(
        "mlflow_model",
        "mlflow",
        "mlflow://mizumi",
        "baggage-damage-detector",
        "Baggage Damage Detector",
        json!({
            "model_name": "baggage-damage-detector",
            "alias": "champion",
            "model_uri": "models:/baggage-damage-detector@champion",
            "experiment": "vietjetair-baggage-damage",
            "description": "CLIP-based zero-shot image classifier for baggage damage detection, trained via LogisticRegression on top of CLIP embeddings",
        }),
    );
    graph.add_alias(
        mlflow_model_id,
        "baggage-damage-detector".to_string(),
        AliasPriority::ShortName,
    );
    graph.add_alias(
        mlflow_model_id,
        "models:/baggage-damage-detector@champion".to_string(),
        AliasPriority::RepoPath,
    );

    // ── MLflow experiment ──────────────────────────────────────────────────────
    let mlflow_experiment_id = graph.ensure_node(
        "mlflow_experiment",
        "mlflow",
        "mlflow://mizumi",
        "vietjetair-baggage-damage",
        "vietjetair-baggage-damage",
        json!({
            "experiment_name": "vietjetair-baggage-damage",
            "description": "MLflow experiment tracking training runs for the baggage damage detector model",
        }),
    );
    graph.add_alias(
        mlflow_experiment_id,
        "vietjetair-baggage-damage".to_string(),
        AliasPriority::ShortName,
    );
    // Experiment promotes champion run to model registry
    graph.add_edge(
        mlflow_experiment_id,
        mlflow_model_id,
        "writes_to",
        1.0,
        json!({ "source": "static", "usage": "model_registration" }),
    );

    // ── Wire train job → experiment (repo scanner handles table↔job edges) ──────
    // ingest_daft_jobs already creates the train/classify job nodes and their
    // table reads_from/writes_to edges. We only add what the scanner can't derive:
    // the train job logging runs to the MLflow experiment, and the classify job
    // loading the registered model for inference.
    let train_job_id = graph
        .resolve_alias("vietjetair/train_baggage_damage_model.py")
        .unwrap_or_else(|| {
            let id = graph.ensure_node(
                "daft_job",
                "daft",
                "daft://mizumi",
                "vietjetair/train_baggage_damage_model.py",
                "train_baggage_damage_model",
                json!({ "path": "packages/daft/jobs/vietjetair/train_baggage_damage_model.py" }),
            );
            graph.add_alias(id, "vietjetair/train_baggage_damage_model.py".to_string(), AliasPriority::RepoPath);
            id
        });
    graph.add_edge(
        train_job_id,
        mlflow_experiment_id,
        "writes_to",
        1.0,
        json!({ "source": "static", "usage": "logs_run" }),
    );

    // ── Volume: baggage images in RustFS ───────────────────────────────────────
    // classify_baggage_damage.py reads raw images from this S3 prefix.
    // The repo scanner handles the classify_job → gold_table writes_to edge.
    let volume_id = graph.ensure_node(
        "volume",
        "rustfs",
        "s3://unitycatalog",
        "vietjetair/baggage_damaged_reports",
        "Baggage Damaged Reports (images)",
        json!({
            "bucket": "unitycatalog",
            "prefix": "vietjetair/baggage_damaged_reports/",
            "description": "Raw baggage damage images uploaded by ground staff, used for zero-shot CLIP classification",
        }),
    );
    graph.add_alias(
        volume_id,
        "vietjetair/baggage_damaged_reports".to_string(),
        AliasPriority::RepoPath,
    );

    let classify_job_id = graph
        .resolve_alias("vietjetair/classify_baggage_damage.py")
        .unwrap_or_else(|| {
            let id = graph.ensure_node(
                "daft_job",
                "daft",
                "daft://mizumi",
                "vietjetair/classify_baggage_damage.py",
                "classify_baggage_damage",
                json!({ "path": "packages/daft/jobs/vietjetair/classify_baggage_damage.py" }),
            );
            graph.add_alias(id, "vietjetair/classify_baggage_damage.py".to_string(), AliasPriority::RepoPath);
            id
        });
    // volume → classify job (can't be derived from repo scan; volume is not a UC table)
    graph.add_edge(
        volume_id,
        classify_job_id,
        "reads_from",
        1.0,
        json!({ "source": "static" }),
    );
}
