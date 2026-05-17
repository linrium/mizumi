use crate::domain::entities::{
    catalog::*,
    function::*,
    metastore::*,
    model::*,
    schema::*,
    table::*,
    user::{CreateUser, UpdateUser, User},
    volume::*,
};
use crate::domain::error::DomainError;
use crate::domain::permissions::{PermissionsList, Privilege, SecurableType, UpdatePermissions};
use async_trait::async_trait;

#[async_trait]
pub trait CatalogUseCase: Send + Sync {
    async fn create_catalog(
        &self,
        principal: &str,
        cmd: CreateCatalog,
    ) -> Result<CatalogInfo, DomainError>;
    async fn list_catalogs(
        &self,
        principal: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListCatalogsResponse, DomainError>;
    async fn get_catalog(&self, principal: &str, name: &str) -> Result<CatalogInfo, DomainError>;
    async fn update_catalog(
        &self,
        principal: &str,
        name: &str,
        cmd: UpdateCatalog,
    ) -> Result<CatalogInfo, DomainError>;
    async fn delete_catalog(
        &self,
        principal: &str,
        name: &str,
        force: bool,
    ) -> Result<(), DomainError>;
}

#[async_trait]
pub trait SchemaUseCase: Send + Sync {
    async fn create_schema(
        &self,
        principal: &str,
        cmd: CreateSchema,
    ) -> Result<SchemaInfo, DomainError>;
    async fn list_schemas(
        &self,
        principal: &str,
        catalog_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListSchemasResponse, DomainError>;
    async fn get_schema(&self, principal: &str, full_name: &str)
        -> Result<SchemaInfo, DomainError>;
    async fn update_schema(
        &self,
        principal: &str,
        full_name: &str,
        cmd: UpdateSchema,
    ) -> Result<SchemaInfo, DomainError>;
    async fn delete_schema(
        &self,
        principal: &str,
        full_name: &str,
        force: bool,
    ) -> Result<(), DomainError>;
}

#[async_trait]
pub trait TableUseCase: Send + Sync {
    async fn create_table(
        &self,
        principal: &str,
        cmd: CreateTable,
    ) -> Result<TableInfo, DomainError>;
    async fn list_tables(
        &self,
        principal: &str,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListTablesResponse, DomainError>;
    async fn get_table(&self, principal: &str, full_name: &str) -> Result<TableInfo, DomainError>;
    async fn generate_temporary_table_credentials(
        &self,
        principal: &str,
        cmd: GenerateTemporaryTableCredential,
    ) -> Result<TemporaryCredentials, DomainError>;
    async fn delete_table(&self, principal: &str, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait VolumeUseCase: Send + Sync {
    async fn create_volume(
        &self,
        principal: &str,
        cmd: CreateVolume,
    ) -> Result<VolumeInfo, DomainError>;
    async fn list_volumes(
        &self,
        principal: &str,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListVolumesResponse, DomainError>;
    async fn get_volume(&self, principal: &str, full_name: &str)
        -> Result<VolumeInfo, DomainError>;
    async fn update_volume(
        &self,
        principal: &str,
        full_name: &str,
        cmd: UpdateVolume,
    ) -> Result<VolumeInfo, DomainError>;
    async fn delete_volume(&self, principal: &str, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait FunctionUseCase: Send + Sync {
    async fn create_function(
        &self,
        principal: &str,
        cmd: CreateFunction,
    ) -> Result<FunctionInfo, DomainError>;
    async fn list_functions(
        &self,
        principal: &str,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListFunctionsResponse, DomainError>;
    async fn get_function(
        &self,
        principal: &str,
        full_name: &str,
    ) -> Result<FunctionInfo, DomainError>;
    async fn delete_function(&self, principal: &str, full_name: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait ModelUseCase: Send + Sync {
    async fn create_registered_model(
        &self,
        principal: &str,
        cmd: CreateRegisteredModel,
    ) -> Result<RegisteredModelInfo, DomainError>;
    async fn list_registered_models(
        &self,
        principal: &str,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListRegisteredModelsResponse, DomainError>;
    async fn get_registered_model(
        &self,
        principal: &str,
        full_name: &str,
    ) -> Result<RegisteredModelInfo, DomainError>;
    async fn update_registered_model(
        &self,
        principal: &str,
        full_name: &str,
        cmd: UpdateRegisteredModel,
    ) -> Result<RegisteredModelInfo, DomainError>;
    async fn delete_registered_model(
        &self,
        principal: &str,
        full_name: &str,
    ) -> Result<(), DomainError>;

    async fn create_model_version(
        &self,
        principal: &str,
        cmd: CreateModelVersion,
    ) -> Result<ModelVersionInfo, DomainError>;
    async fn list_model_versions(
        &self,
        principal: &str,
        model_full_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListModelVersionsResponse, DomainError>;
    async fn get_model_version(
        &self,
        principal: &str,
        model_full_name: &str,
        version: i64,
    ) -> Result<ModelVersionInfo, DomainError>;
    async fn update_model_version(
        &self,
        principal: &str,
        model_full_name: &str,
        version: i64,
        cmd: UpdateModelVersion,
    ) -> Result<ModelVersionInfo, DomainError>;
    async fn delete_model_version(
        &self,
        principal: &str,
        model_full_name: &str,
        version: i64,
    ) -> Result<(), DomainError>;
}

#[async_trait]
pub trait MetastoreUseCase: Send + Sync {
    async fn get_metastore(&self) -> Result<MetastoreInfo, DomainError>;
}

#[async_trait]
pub trait UserUseCase: Send + Sync {
    async fn create_user(&self, cmd: CreateUser) -> Result<User, DomainError>;
    async fn list_users(
        &self,
        start_index: Option<usize>,
        count: Option<usize>,
    ) -> Result<Vec<User>, DomainError>;
    async fn get_user(&self, id: &str) -> Result<User, DomainError>;
    async fn update_user(&self, id: &str, cmd: UpdateUser) -> Result<User, DomainError>;
    async fn delete_user(&self, id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait PermissionUseCase: Send + Sync {
    async fn get_permissions(
        &self,
        principal: &str,
        securable_type: SecurableType,
        full_name: &str,
    ) -> Result<PermissionsList, DomainError>;
    async fn update_permissions(
        &self,
        principal: &str,
        securable_type: SecurableType,
        full_name: &str,
        changes: UpdatePermissions,
    ) -> Result<PermissionsList, DomainError>;
    /// Return only the privileges granted directly to `principal` — no owner check required.
    async fn get_effective_privileges(
        &self,
        principal: &str,
        securable_type: SecurableType,
        full_name: &str,
    ) -> Result<Vec<Privilege>, DomainError>;
}
