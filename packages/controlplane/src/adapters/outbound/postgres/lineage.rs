use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::entities::lineage::{LineageEdge, LineageNode, LineageSyncRun};

#[derive(Debug, Clone)]
pub struct NewLineageNode {
    pub id: Uuid,
    pub node_type: String,
    pub platform: String,
    pub namespace: String,
    pub name: String,
    pub display_name: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct NewLineageEdge {
    pub src_node_id: Uuid,
    pub dst_node_id: Uuid,
    pub edge_type: String,
    pub confidence: f64,
    pub properties: serde_json::Value,
}

pub async fn start_sync_run(db: &PgPool) -> Result<LineageSyncRun, sqlx::Error> {
    sqlx::query_as::<_, LineageSyncRun>(
        r#"
        INSERT INTO lineage_sync_runs (status)
        VALUES ('running')
        RETURNING *
        "#,
    )
    .fetch_one(db)
    .await
}

pub async fn finish_sync_run(
    db: &PgPool,
    run_id: Uuid,
    status: &str,
    nodes_count: i32,
    edges_count: i32,
    aliases_count: i32,
    message: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE lineage_sync_runs
        SET status = $2,
            completed_at = NOW(),
            nodes_count = $3,
            edges_count = $4,
            aliases_count = $5,
            message = $6
        WHERE id = $1
        "#,
    )
    .bind(run_id)
    .bind(status)
    .bind(nodes_count)
    .bind(edges_count)
    .bind(aliases_count)
    .bind(message)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn replace_graph(
    db: &PgPool,
    nodes: &[NewLineageNode],
    aliases: &[(Uuid, String)],
    edges: &[NewLineageEdge],
) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;

    sqlx::query("DELETE FROM lineage_edges")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM lineage_node_aliases")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM lineage_nodes")
        .execute(&mut *tx)
        .await?;

    for node in nodes {
        sqlx::query(
            r#"
            INSERT INTO lineage_nodes (
                id, node_type, platform, namespace, name, display_name, properties
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(node.id)
        .bind(&node.node_type)
        .bind(&node.platform)
        .bind(&node.namespace)
        .bind(&node.name)
        .bind(&node.display_name)
        .bind(&node.properties)
        .execute(&mut *tx)
        .await?;
    }

    for (node_id, alias) in aliases {
        sqlx::query(
            r#"
            INSERT INTO lineage_node_aliases (node_id, alias)
            VALUES ($1, $2)
            "#,
        )
        .bind(node_id)
        .bind(alias)
        .execute(&mut *tx)
        .await?;
    }

    for edge in edges {
        sqlx::query(
            r#"
            INSERT INTO lineage_edges (
                src_node_id, dst_node_id, edge_type, confidence, properties
            ) VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(edge.src_node_id)
        .bind(edge.dst_node_id)
        .bind(&edge.edge_type)
        .bind(edge.confidence)
        .bind(&edge.properties)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn list_nodes(db: &PgPool) -> Result<Vec<LineageNode>, sqlx::Error> {
    sqlx::query_as::<_, LineageNode>("SELECT * FROM lineage_nodes ORDER BY display_name ASC")
        .fetch_all(db)
        .await
}

pub async fn list_edges(db: &PgPool) -> Result<Vec<LineageEdge>, sqlx::Error> {
    sqlx::query_as::<_, LineageEdge>("SELECT * FROM lineage_edges ORDER BY edge_type ASC")
        .fetch_all(db)
        .await
}

pub async fn resolve_node_by_token(
    db: &PgPool,
    token: &str,
) -> Result<Option<LineageNode>, sqlx::Error> {
    if let Ok(id) = Uuid::parse_str(token) {
        if let Some(node) =
            sqlx::query_as::<_, LineageNode>("SELECT * FROM lineage_nodes WHERE id = $1")
                .bind(id)
                .fetch_optional(db)
                .await?
        {
            return Ok(Some(node));
        }
    }

    if let Some(node) = sqlx::query_as::<_, LineageNode>(
        r#"
        SELECT n.*
        FROM lineage_nodes n
        JOIN lineage_node_aliases a ON a.node_id = n.id
        WHERE a.alias = $1
        LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(db)
    .await?
    {
        return Ok(Some(node));
    }

    sqlx::query_as::<_, LineageNode>(
        r#"
        SELECT *
        FROM lineage_nodes
        WHERE name = $1 OR display_name = $1
        ORDER BY display_name ASC
        LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(db)
    .await
}

pub async fn search_nodes(
    db: &PgPool,
    query: &str,
    limit: i64,
) -> Result<Vec<LineageNode>, sqlx::Error> {
    let q = format!("%{}%", query.to_lowercase());
    sqlx::query_as::<_, LineageNode>(
        r#"
        SELECT DISTINCT n.*
        FROM lineage_nodes n
        LEFT JOIN lineage_node_aliases a ON a.node_id = n.id
        WHERE LOWER(n.display_name) LIKE $1
           OR LOWER(n.name) LIKE $1
           OR LOWER(n.namespace) LIKE $1
           OR LOWER(a.alias) LIKE $1
        ORDER BY n.display_name ASC
        LIMIT $2
        "#,
    )
    .bind(q)
    .bind(limit)
    .fetch_all(db)
    .await
}
