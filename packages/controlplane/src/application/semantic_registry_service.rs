use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::semantic_registry,
    domain::{
        entities::semantic_registry::{
            CreateSemanticDefinitionRequest, SemanticCompareResponse, SemanticDefinition,
            SemanticDefinitionDetail, SemanticDefinitionSummary, SemanticDefinitionsQuery,
            SemanticDependency, SemanticGraphResponse, SemanticPhysicalDependencyInput,
            TransitionSemanticStatusRequest,
        },
        error::AppError,
    },
};

#[derive(Clone)]
pub struct SemanticRegistryService {
    db: PgPool,
}

impl SemanticRegistryService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn list_definitions(
        &self,
        query: SemanticDefinitionsQuery,
    ) -> Result<Vec<SemanticDefinitionSummary>, AppError> {
        let definitions = semantic_registry::list_definitions(&self.db).await?;
        let edges = semantic_registry::list_all_dependencies(&self.db).await?;
        let mut grouped: BTreeMap<(String, String), Vec<SemanticDefinition>> = BTreeMap::new();

        for definition in definitions {
            if let Some(namespace) = query.namespace.as_deref() {
                if definition.namespace != namespace {
                    continue;
                }
            }
            if let Some(status) = query.status.as_deref() {
                if status != "all" && definition.status != status {
                    continue;
                }
            }
            if let Some(object_type) = query.object_type.as_deref() {
                if object_type != "all" && definition.object_type != object_type {
                    continue;
                }
            }
            if let Some(search) = query.search.as_deref() {
                let needle = search.trim().to_lowercase();
                if !needle.is_empty()
                    && ![
                        definition.namespace.as_str(),
                        definition.name.as_str(),
                        definition.owner_principal.as_str(),
                        definition.description.as_str(),
                        definition.status.as_str(),
                    ]
                    .iter()
                    .any(|value| value.to_lowercase().contains(&needle))
                {
                    continue;
                }
            }

            grouped
                .entry((definition.namespace.clone(), definition.name.clone()))
                .or_default()
                .push(definition);
        }

        let mut summaries = Vec::with_capacity(grouped.len());
        for ((_namespace, _name), mut versions) in grouped {
            versions.sort_by_key(|item| item.version);
            let latest = versions
                .last()
                .cloned()
                .ok_or_else(|| AppError::QueryFailed("empty semantic definition group".into()))?;
            let active_version = versions
                .iter()
                .find(|item| item.status == "active")
                .map(|item| item.version);
            let version_ids = versions.iter().map(|item| item.id).collect::<HashSet<_>>();
            let latest_dependency_count = edges
                .iter()
                .filter(|edge| edge.source_definition_id == latest.id)
                .count();
            let latest_dependent_count = edges
                .iter()
                .filter(|edge| edge.target_definition_id == latest.id)
                .count();
            let physical_dependency_count =
                semantic_registry::list_physical_dependencies(&self.db, latest.id)
                    .await?
                    .len();

            summaries.push(SemanticDefinitionSummary {
                namespace: latest.namespace,
                name: latest.name,
                object_type: latest.object_type,
                owner_principal: latest.owner_principal,
                description: latest.description,
                active_version,
                latest_version: latest.version,
                latest_status: latest.status,
                version_count: version_ids.len(),
                semantic_dependency_count: latest_dependency_count,
                direct_dependent_count: latest_dependent_count,
                physical_dependency_count,
                updated_at: latest.updated_at,
            });
        }

        summaries.sort_by(|a, b| {
            a.namespace
                .cmp(&b.namespace)
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(summaries)
    }

    pub async fn list_versions(
        &self,
        namespace: &str,
        name: &str,
    ) -> Result<Vec<SemanticDefinition>, AppError> {
        let versions = semantic_registry::list_versions(&self.db, namespace, name).await?;
        if versions.is_empty() {
            return Err(AppError::NotFound);
        }
        Ok(versions)
    }

    pub async fn get_detail(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
    ) -> Result<SemanticDefinitionDetail, AppError> {
        let definition = self.require_definition(namespace, name, version).await?;
        self.detail_for(definition).await
    }

    pub async fn create_definition(
        &self,
        req: CreateSemanticDefinitionRequest,
        principal: &str,
    ) -> Result<SemanticDefinitionDetail, AppError> {
        validate_create_request(&req)?;

        let supersedes_definition_id = match req.supersedes_version {
            Some(version) => {
                let superseded = self
                    .require_definition(&req.namespace, &req.name, version)
                    .await
                    .map_err(|err| match err {
                        AppError::NotFound => AppError::BadRequest(format!(
                            "superseded semantic version {}.{}@v{} does not exist",
                            req.namespace, req.name, version
                        )),
                        other => other,
                    })?;
                Some(superseded.id)
            }
            None => None,
        };

        let dependency_targets = self.resolve_dependency_targets(&req).await?;
        self.reject_cycle(None, &dependency_targets).await?;

        let mut tx = self.db.begin().await?;
        let definition = semantic_registry::create_definition(
            &mut tx,
            req.namespace.trim(),
            req.name.trim(),
            req.object_type.trim(),
            req.version,
            req.owner_principal.trim(),
            req.description.trim(),
            &req.spec,
            req.time_semantics.as_ref(),
            supersedes_definition_id,
            principal,
        )
        .await
        .map_err(|e| {
            if semantic_registry::is_unique_violation(&e) {
                AppError::Conflict(format!(
                    "{}.{}@v{} already exists",
                    req.namespace, req.name, req.version
                ))
            } else {
                AppError::Sqlx(e)
            }
        })?;

        for (target, dependency_type) in &dependency_targets {
            semantic_registry::insert_dependency(
                &mut tx,
                definition.id,
                target.id,
                dependency_type,
            )
            .await?;
        }
        for dep in &req.physical_dependencies {
            semantic_registry::insert_physical_dependency(&mut tx, definition.id, dep).await?;
        }
        semantic_registry::insert_lifecycle_event(
            &mut tx,
            definition.id,
            None,
            &definition.status,
            principal,
            Some("definition created"),
        )
        .await?;
        tx.commit().await?;

        self.detail_for(definition).await
    }

    pub async fn transition_status(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
        req: TransitionSemanticStatusRequest,
        principal: &str,
    ) -> Result<SemanticDefinitionDetail, AppError> {
        let current = self.require_definition(namespace, name, version).await?;
        validate_transition(&current.status, &req.status)?;

        let mut tx = self.db.begin().await?;
        let updated = semantic_registry::transition_status(&mut tx, current.id, &req.status)
            .await
            .map_err(|e| {
                if semantic_registry::is_unique_violation(&e) {
                    AppError::Conflict(format!(
                        "{}.{} already has an active version",
                        namespace, name
                    ))
                } else {
                    AppError::Sqlx(e)
                }
            })?;
        semantic_registry::insert_lifecycle_event(
            &mut tx,
            current.id,
            Some(&current.status),
            &updated.status,
            principal,
            req.reason.as_deref(),
        )
        .await?;
        tx.commit().await?;

        self.detail_for(updated).await
    }

    pub async fn graph(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
        direction: Option<String>,
        depth: Option<usize>,
    ) -> Result<SemanticGraphResponse, AppError> {
        let root = self.require_definition(namespace, name, version).await?;
        let direction = direction.unwrap_or_else(|| "both".to_string());
        let depth = depth.unwrap_or(4);
        let definitions = semantic_registry::list_definitions(&self.db).await?;
        let edges = semantic_registry::list_all_dependencies(&self.db).await?;
        let nodes_by_id = definitions
            .into_iter()
            .map(|definition| (definition.id, definition))
            .collect::<HashMap<_, _>>();

        let mut selected_nodes = HashSet::from([root.id]);
        let mut selected_edges = HashSet::new();
        let mut queue = VecDeque::from([(root.id, 0usize)]);

        while let Some((current, dist)) = queue.pop_front() {
            if dist >= depth {
                continue;
            }
            for edge in &edges {
                let traverse = match direction.as_str() {
                    "upstream" => edge.source_definition_id == current,
                    "downstream" => edge.target_definition_id == current,
                    _ => {
                        edge.source_definition_id == current || edge.target_definition_id == current
                    }
                };
                if !traverse {
                    continue;
                }

                let next = if edge.source_definition_id == current {
                    edge.target_definition_id
                } else {
                    edge.source_definition_id
                };
                selected_edges.insert(edge.id);
                if selected_nodes.insert(next) {
                    queue.push_back((next, dist + 1));
                }
            }
        }

        let mut nodes = selected_nodes
            .into_iter()
            .filter_map(|id| nodes_by_id.get(&id).cloned())
            .collect::<Vec<_>>();
        nodes.sort_by(|a, b| {
            a.namespace
                .cmp(&b.namespace)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.version.cmp(&b.version))
        });
        let mut selected = edges
            .into_iter()
            .filter(|edge| selected_edges.contains(&edge.id))
            .collect::<Vec<_>>();
        selected.sort_by_key(|edge| edge.created_at);

        Ok(SemanticGraphResponse {
            root,
            direction,
            depth,
            nodes,
            edges: selected,
        })
    }

    pub async fn compare(
        &self,
        namespace: &str,
        name: &str,
        from: i32,
        to: i32,
    ) -> Result<SemanticCompareResponse, AppError> {
        let from_detail = self.get_detail(namespace, name, from).await?;
        let to_detail = self.get_detail(namespace, name, to).await?;
        let changes = json!({
            "status_changed": from_detail.definition.status != to_detail.definition.status,
            "owner_changed": from_detail.definition.owner_principal != to_detail.definition.owner_principal,
            "description_changed": from_detail.definition.description != to_detail.definition.description,
            "spec_changed": from_detail.definition.spec != to_detail.definition.spec,
            "time_semantics_changed": from_detail.definition.time_semantics != to_detail.definition.time_semantics,
            "semantic_dependencies_changed": dependency_keys(&from_detail.dependencies) != dependency_keys(&to_detail.dependencies),
            "physical_dependencies_changed": physical_keys(&from_detail.physical_dependencies) != physical_keys(&to_detail.physical_dependencies),
        });

        Ok(SemanticCompareResponse {
            from: from_detail,
            to: to_detail,
            changes,
        })
    }

    async fn require_definition(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
    ) -> Result<SemanticDefinition, AppError> {
        semantic_registry::get_definition(&self.db, namespace, name, version)
            .await?
            .ok_or(AppError::NotFound)
    }

    async fn detail_for(
        &self,
        definition: SemanticDefinition,
    ) -> Result<SemanticDefinitionDetail, AppError> {
        let all_definitions = semantic_registry::list_definitions(&self.db).await?;
        let all_by_id = all_definitions
            .iter()
            .cloned()
            .map(|item| (item.id, item))
            .collect::<HashMap<_, _>>();
        let all_edges = semantic_registry::list_all_dependencies(&self.db).await?;
        let dependency_edges = all_edges
            .iter()
            .filter(|edge| edge.source_definition_id == definition.id)
            .cloned()
            .collect::<Vec<_>>();
        let dependencies = dependency_edges
            .iter()
            .filter_map(|edge| all_by_id.get(&edge.target_definition_id).cloned())
            .collect::<Vec<_>>();
        let dependents = all_edges
            .iter()
            .filter(|edge| edge.target_definition_id == definition.id)
            .filter_map(|edge| all_by_id.get(&edge.source_definition_id).cloned())
            .collect::<Vec<_>>();
        let physical_dependencies =
            semantic_registry::list_physical_dependencies(&self.db, definition.id).await?;
        let lifecycle_history =
            semantic_registry::list_lifecycle_events(&self.db, definition.id).await?;

        Ok(SemanticDefinitionDetail {
            definition,
            dependencies,
            dependency_edges,
            dependents,
            physical_dependencies,
            lifecycle_history,
        })
    }

    async fn resolve_dependency_targets(
        &self,
        req: &CreateSemanticDefinitionRequest,
    ) -> Result<Vec<(SemanticDefinition, String)>, AppError> {
        let mut targets = Vec::with_capacity(req.dependencies.len());
        for dep in &req.dependencies {
            validate_identifier("dependency namespace", &dep.namespace)?;
            validate_identifier("dependency name", &dep.name)?;
            if dep.version <= 0 {
                return Err(AppError::BadRequest(
                    "dependency version must be greater than zero".into(),
                ));
            }
            let target = self
                .require_definition(&dep.namespace, &dep.name, dep.version)
                .await
                .map_err(|err| match err {
                    AppError::NotFound => AppError::BadRequest(format!(
                        "semantic dependency {}.{}@v{} does not exist",
                        dep.namespace, dep.name, dep.version
                    )),
                    other => other,
                })?;
            targets.push((target, dep.dependency_type.trim().to_string()));
        }
        Ok(targets)
    }

    async fn reject_cycle(
        &self,
        source_id: Option<Uuid>,
        dependency_targets: &[(SemanticDefinition, String)],
    ) -> Result<(), AppError> {
        let Some(source_id) = source_id else {
            return Ok(());
        };
        let edges = semantic_registry::list_all_dependencies(&self.db).await?;
        for (target, _) in dependency_targets {
            if reaches(source_id, target.id, &edges) {
                return Err(AppError::Conflict(
                    "semantic dependency cycle detected".to_string(),
                ));
            }
        }
        Ok(())
    }
}

fn validate_create_request(req: &CreateSemanticDefinitionRequest) -> Result<(), AppError> {
    validate_identifier("namespace", &req.namespace)?;
    validate_identifier("name", &req.name)?;
    validate_identifier("owner_principal", &req.owner_principal)?;
    if req.object_type.trim() != "metric" {
        return Err(AppError::BadRequest(
            "only metric semantic definitions are supported in the MVP".into(),
        ));
    }
    if req.version <= 0 {
        return Err(AppError::BadRequest(
            "version must be greater than zero".into(),
        ));
    }
    if !req.spec.is_object() {
        return Err(AppError::BadRequest(
            "metric spec must be a JSON object".into(),
        ));
    }
    for dep in &req.physical_dependencies {
        validate_physical_dependency(dep)?;
    }
    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> Result<(), AppError> {
    if value.trim().is_empty() {
        return Err(AppError::BadRequest(format!("{label} is required")));
    }
    Ok(())
}

fn validate_physical_dependency(dep: &SemanticPhysicalDependencyInput) -> Result<(), AppError> {
    validate_identifier("physical dependency catalog", &dep.catalog)?;
    validate_identifier("physical dependency schema_name", &dep.schema_name)?;
    validate_identifier("physical dependency object_name", &dep.object_name)?;
    validate_identifier("physical dependency object_type", &dep.object_type)?;
    Ok(())
}

fn validate_transition(current: &str, next: &str) -> Result<(), AppError> {
    let allowed = match current {
        "draft" => ["validated", "retired"].as_slice(),
        "validated" => ["candidate"].as_slice(),
        "candidate" => ["certified"].as_slice(),
        "certified" => ["active"].as_slice(),
        "active" => ["deprecated"].as_slice(),
        "deprecated" => ["retired"].as_slice(),
        "retired" => [].as_slice(),
        _ => [].as_slice(),
    };

    if allowed.contains(&next) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "invalid lifecycle transition from {current} to {next}"
        )))
    }
}

fn reaches(target_id: Uuid, start_id: Uuid, edges: &[SemanticDependency]) -> bool {
    let mut seen = HashSet::new();
    let mut queue = VecDeque::from([start_id]);
    while let Some(current) = queue.pop_front() {
        if current == target_id {
            return true;
        }
        if !seen.insert(current) {
            continue;
        }
        for edge in edges {
            if edge.source_definition_id == current {
                queue.push_back(edge.target_definition_id);
            }
        }
    }
    false
}

fn dependency_keys(definitions: &[SemanticDefinition]) -> Vec<String> {
    let mut keys = definitions
        .iter()
        .map(|item| format!("{}.{}@v{}", item.namespace, item.name, item.version))
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

fn physical_keys(
    dependencies: &[crate::domain::entities::semantic_registry::SemanticPhysicalDependency],
) -> Vec<String> {
    let mut keys = dependencies
        .iter()
        .map(|item| {
            format!(
                "{}.{}.{}:{}",
                item.catalog, item.schema_name, item.object_name, item.object_type
            )
        })
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn edge(source_definition_id: Uuid, target_definition_id: Uuid) -> SemanticDependency {
        SemanticDependency {
            id: Uuid::new_v4(),
            source_definition_id,
            target_definition_id,
            dependency_type: "semantic".to_string(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn validates_lifecycle_transitions() {
        assert!(validate_transition("draft", "validated").is_ok());
        assert!(validate_transition("active", "deprecated").is_ok());
        assert!(validate_transition("draft", "active").is_err());
        assert!(validate_transition("retired", "active").is_err());
    }

    #[test]
    fn detects_transitive_reachability() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let c = Uuid::new_v4();
        let edges = vec![edge(a, b), edge(b, c)];

        assert!(reaches(c, a, &edges));
        assert!(!reaches(a, c, &edges));
    }
}
