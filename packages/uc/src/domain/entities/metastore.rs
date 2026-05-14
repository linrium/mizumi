use serde::Serialize;
use uuid::Uuid;

/// The metastore is a single-row identity record — only its UUID matters.
#[derive(Debug, Clone, Serialize)]
pub struct MetastoreInfo {
    pub metastore_id: Uuid,
}
