use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::domain::entities::semantic_registry::{
    SemanticDefinition, SemanticDependency, SemanticLifecycleEvent, SemanticPhysicalDependency,
    SemanticPhysicalDependencyInput,
};

pub fn is_unique_violation(e: &sqlx::Error) -> bool {
    matches!(
        e,
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505")
    )
}

pub async fn list_definitions(db: &PgPool) -> Result<Vec<SemanticDefinition>, sqlx::Error> {
    sqlx::query_as::<_, SemanticDefinition>(
        r#"
        SELECT *
        FROM semantic_definitions
        ORDER BY namespace ASC, name ASC, version DESC
        "#,
    )
    .fetch_all(db)
    .await
}

pub async fn get_definition(
    db: &PgPool,
    namespace: &str,
    name: &str,
    version: i32,
) -> Result<Option<SemanticDefinition>, sqlx::Error> {
    sqlx::query_as::<_, SemanticDefinition>(
        r#"
        SELECT *
        FROM semantic_definitions
        WHERE namespace = $1 AND name = $2 AND version = $3
        "#,
    )
    .bind(namespace)
    .bind(name)
    .bind(version)
    .fetch_optional(db)
    .await
}

pub async fn list_versions(
    db: &PgPool,
    namespace: &str,
    name: &str,
) -> Result<Vec<SemanticDefinition>, sqlx::Error> {
    sqlx::query_as::<_, SemanticDefinition>(
        r#"
        SELECT *
        FROM semantic_definitions
        WHERE namespace = $1 AND name = $2
        ORDER BY version DESC
        "#,
    )
    .bind(namespace)
    .bind(name)
    .fetch_all(db)
    .await
}

pub async fn list_all_dependencies(db: &PgPool) -> Result<Vec<SemanticDependency>, sqlx::Error> {
    sqlx::query_as::<_, SemanticDependency>(
        r#"
        SELECT *
        FROM semantic_dependencies
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(db)
    .await
}

pub async fn list_physical_dependencies(
    db: &PgPool,
    definition_id: Uuid,
) -> Result<Vec<SemanticPhysicalDependency>, sqlx::Error> {
    sqlx::query_as::<_, SemanticPhysicalDependency>(
        r#"
        SELECT *
        FROM semantic_physical_dependencies
        WHERE semantic_definition_id = $1
        ORDER BY catalog ASC, schema_name ASC, object_name ASC
        "#,
    )
    .bind(definition_id)
    .fetch_all(db)
    .await
}

pub async fn list_lifecycle_events(
    db: &PgPool,
    definition_id: Uuid,
) -> Result<Vec<SemanticLifecycleEvent>, sqlx::Error> {
    sqlx::query_as::<_, SemanticLifecycleEvent>(
        r#"
        SELECT *
        FROM semantic_lifecycle_events
        WHERE definition_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(definition_id)
    .fetch_all(db)
    .await
}

pub async fn create_definition(
    tx: &mut Transaction<'_, Postgres>,
    namespace: &str,
    name: &str,
    object_type: &str,
    version: i32,
    owner_principal: &str,
    description: &str,
    spec: &serde_json::Value,
    time_semantics: Option<&serde_json::Value>,
    supersedes_definition_id: Option<Uuid>,
    created_by: &str,
) -> Result<SemanticDefinition, sqlx::Error> {
    sqlx::query_as::<_, SemanticDefinition>(
        r#"
        INSERT INTO semantic_definitions (
            namespace, name, object_type, version, status, owner_principal,
            description, spec, time_semantics, supersedes_definition_id, created_by
        )
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#,
    )
    .bind(namespace)
    .bind(name)
    .bind(object_type)
    .bind(version)
    .bind(owner_principal)
    .bind(description)
    .bind(spec)
    .bind(time_semantics)
    .bind(supersedes_definition_id)
    .bind(created_by)
    .fetch_one(&mut **tx)
    .await
}

pub async fn insert_dependency(
    tx: &mut Transaction<'_, Postgres>,
    source_id: Uuid,
    target_id: Uuid,
    dependency_type: &str,
) -> Result<SemanticDependency, sqlx::Error> {
    sqlx::query_as::<_, SemanticDependency>(
        r#"
        INSERT INTO semantic_dependencies (
            source_definition_id, target_definition_id, dependency_type
        )
        VALUES ($1, $2, $3)
        RETURNING *
        "#,
    )
    .bind(source_id)
    .bind(target_id)
    .bind(dependency_type)
    .fetch_one(&mut **tx)
    .await
}

pub async fn insert_physical_dependency(
    tx: &mut Transaction<'_, Postgres>,
    definition_id: Uuid,
    dep: &SemanticPhysicalDependencyInput,
) -> Result<SemanticPhysicalDependency, sqlx::Error> {
    sqlx::query_as::<_, SemanticPhysicalDependency>(
        r#"
        INSERT INTO semantic_physical_dependencies (
            semantic_definition_id, catalog, schema_name, object_name, object_type, contract_version
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(definition_id)
    .bind(&dep.catalog)
    .bind(&dep.schema_name)
    .bind(&dep.object_name)
    .bind(&dep.object_type)
    .bind(dep.contract_version)
    .fetch_one(&mut **tx)
    .await
}

pub async fn insert_lifecycle_event(
    tx: &mut Transaction<'_, Postgres>,
    definition_id: Uuid,
    previous_status: Option<&str>,
    new_status: &str,
    principal: &str,
    reason: Option<&str>,
) -> Result<SemanticLifecycleEvent, sqlx::Error> {
    sqlx::query_as::<_, SemanticLifecycleEvent>(
        r#"
        INSERT INTO semantic_lifecycle_events (
            definition_id, previous_status, new_status, principal, reason
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(definition_id)
    .bind(previous_status)
    .bind(new_status)
    .bind(principal)
    .bind(reason)
    .fetch_one(&mut **tx)
    .await
}

pub async fn transition_status(
    tx: &mut Transaction<'_, Postgres>,
    definition_id: Uuid,
    status: &str,
) -> Result<SemanticDefinition, sqlx::Error> {
    sqlx::query_as::<_, SemanticDefinition>(
        r#"
        UPDATE semantic_definitions
        SET status = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(definition_id)
    .bind(status)
    .fetch_one(&mut **tx)
    .await
}
