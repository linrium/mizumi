use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogInfo {
    pub id: Uuid,
    pub name: String,
    pub comment: Option<String>,
    pub properties: Option<HashMap<String, String>>,
    pub owner: Option<String>,
    pub created_at: i64,
    pub created_by: Option<String>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
    pub storage_root: Option<String>,
    pub storage_location: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCatalog {
    pub name: String,
    pub comment: Option<String>,
    pub properties: Option<HashMap<String, String>>,
    pub storage_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCatalog {
    pub new_name: Option<String>,
    pub comment: Option<String>,
    pub properties: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListCatalogsResponse {
    pub catalogs: Vec<CatalogInfo>,
    pub next_page_token: Option<String>,
}
