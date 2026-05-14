use async_trait::async_trait;
use crate::domain::entities::{
    catalog::*,
    schema::*,
    table::*,
    volume::*,
    function::*,
    model::*,
    metastore::*,
    user::{User, CreateUser, UpdateUser},
};
use crate::domain::error::DomainError;
use crate::domain::permissions::{Privilege, SecurableType, PermissionsList};

#[async_trait]
pub trait CatalogRepository: Send + Sync {
    async fn create(&self, cmd: CreateCatalog) -> Result<CatalogInfo, DomainError>;
    async fn list(&self, max_results: Option<i32>, page_token: Option<String>) -> Result<ListCatalogsResponse, DomainError>;
    async fn get(&self, name: &str) -> Result<CatalogInfo, DomainError>;
    async fn update(&self, name: &str, cmd: UpdateCatalog) -> Result<CatalogInfo, DomainError>;
    async fn delete(&self, name: &str, force: bool) -> Result<(), DomainError>;
}

#[async_trait]
pub trait SchemaRepository: Send + Sync {
    async fn create(&self, cmd: CreateSchema) -> Result<SchemaInfo, DomainError>;
    async fn list(&self, catalog_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListSchemasResponse, DomainError>;
    async fn get(&self, full_name: &str) -> Result<SchemaInfo, DomainError>;
    async fn update(&self, full_name: &str, cmd: UpdateSchema) -> Result<SchemaInfo, DomainError>;
    async fn delete(&self, full_name: &str, force: bool) -> Result<(), DomainError>;
}

#[async_trait]
pub trait TableRepository: Send + Sync {
    async fn create(&self, cmd: CreateTable) -> Result<TableInfo, DomainError>;
    async fn list(&self, catalog_name: &str, schema_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListTablesResponse, DomainError>;
    async fn get(&self, full_name: &str) -> Result<TableInfo, DomainError>;
    async fn delete(&self, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait VolumeRepository: Send + Sync {
    async fn create(&self, cmd: CreateVolume) -> Result<VolumeInfo, DomainError>;
    async fn list(&self, catalog_name: &str, schema_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListVolumesResponse, DomainError>;
    async fn get(&self, full_name: &str) -> Result<VolumeInfo, DomainError>;
    async fn update(&self, full_name: &str, cmd: UpdateVolume) -> Result<VolumeInfo, DomainError>;
    async fn delete(&self, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait FunctionRepository: Send + Sync {
    async fn create(&self, cmd: CreateFunction) -> Result<FunctionInfo, DomainError>;
    async fn list(&self, catalog_name: &str, schema_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListFunctionsResponse, DomainError>;
    async fn get(&self, full_name: &str) -> Result<FunctionInfo, DomainError>;
    async fn delete(&self, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait RegisteredModelRepository: Send + Sync {
    async fn create(&self, cmd: CreateRegisteredModel) -> Result<RegisteredModelInfo, DomainError>;
    async fn list(&self, catalog_name: &str, schema_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListRegisteredModelsResponse, DomainError>;
    async fn get(&self, full_name: &str) -> Result<RegisteredModelInfo, DomainError>;
    async fn update(&self, full_name: &str, cmd: UpdateRegisteredModel) -> Result<RegisteredModelInfo, DomainError>;
    async fn delete(&self, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait ModelVersionRepository: Send + Sync {
    async fn create(&self, cmd: CreateModelVersion) -> Result<ModelVersionInfo, DomainError>;
    async fn list(&self, model_full_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListModelVersionsResponse, DomainError>;
    async fn get(&self, model_full_name: &str, version: i64) -> Result<ModelVersionInfo, DomainError>;
    async fn update(&self, model_full_name: &str, version: i64, cmd: UpdateModelVersion) -> Result<ModelVersionInfo, DomainError>;
    async fn delete(&self, model_full_name: &str, version: i64) -> Result<(), DomainError>;
}

#[async_trait]
pub trait MetastoreRepository: Send + Sync {
    async fn initialize(&self) -> Result<MetastoreInfo, DomainError>;
    async fn get(&self) -> Result<MetastoreInfo, DomainError>;
}

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn create(&self, cmd: CreateUser) -> Result<User, DomainError>;
    async fn list(&self, start_index: usize, count: usize) -> Result<Vec<User>, DomainError>;
    async fn get(&self, id: &str) -> Result<User, DomainError>;
    async fn update(&self, id: &str, cmd: UpdateUser) -> Result<User, DomainError>;
    async fn delete(&self, id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait AuthorizerPort: Send + Sync {
    /// Check if principal has the given privilege on an object (direct grant OR OWNER on any ancestor).
    async fn is_authorized(&self, principal: &str, securable_type: SecurableType, object_id: &str, privilege: Privilege) -> Result<bool, DomainError>;

    /// Check if principal has ANY of the given privileges on an object.
    async fn is_authorized_any(&self, principal: &str, securable_type: SecurableType, object_id: &str, privileges: &[Privilege]) -> Result<bool, DomainError>;

    /// Check if principal has ALL of the given privileges on an object.
    async fn is_authorized_all(&self, principal: &str, securable_type: SecurableType, object_id: &str, privileges: &[Privilege]) -> Result<bool, DomainError>;

    /// Grant a privilege.
    async fn grant(&self, principal: &str, securable_type: SecurableType, object_id: &str, privilege: Privilege) -> Result<(), DomainError>;

    /// Revoke a privilege.
    async fn revoke(&self, principal: &str, securable_type: SecurableType, object_id: &str, privilege: Privilege) -> Result<(), DomainError>;

    /// List all grants for an object.
    async fn list_grants(&self, securable_type: SecurableType, object_id: &str) -> Result<PermissionsList, DomainError>;

    /// Register parent-child relationship in hierarchy.
    async fn add_hierarchy(&self, child_type: SecurableType, child_id: &str, parent_type: SecurableType, parent_id: &str) -> Result<(), DomainError>;

    /// Remove all grants and hierarchy entries for an object (called on delete).
    async fn remove_object(&self, securable_type: SecurableType, object_id: &str) -> Result<(), DomainError>;
}
