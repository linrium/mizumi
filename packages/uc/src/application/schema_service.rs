use std::sync::Arc;
use async_trait::async_trait;
use crate::domain::{
    entities::schema::*,
    error::DomainError,
    permissions::{Privilege, SecurableType},
    ports::{
        inbound::SchemaUseCase,
        outbound::{AuthorizerPort, SchemaRepository},
    },
};

pub struct SchemaService {
    repo: Arc<dyn SchemaRepository>,
    authorizer: Arc<dyn AuthorizerPort>,
}

impl SchemaService {
    pub fn new(repo: Arc<dyn SchemaRepository>, authorizer: Arc<dyn AuthorizerPort>) -> Self {
        Self { repo, authorizer }
    }
}

#[async_trait]
impl SchemaUseCase for SchemaService {
    async fn create_schema(&self, principal: &str, cmd: CreateSchema) -> Result<SchemaInfo, DomainError> {
        let catalog_name = cmd.catalog_name.clone();
        // Must be catalog OWNER OR (USE_CATALOG + CREATE_SCHEMA)
        let cat_owner = self.authorizer
            .is_authorized(principal, SecurableType::Catalog, &catalog_name, Privilege::Owner)
            .await?;
        let can_create = if !cat_owner {
            self.authorizer
                .is_authorized_all(principal, SecurableType::Catalog, &catalog_name, &[Privilege::UseCatalog, Privilege::CreateSchema])
                .await?
        } else {
            true
        };
        if !can_create {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, catalog_name
            )));
        }
        let schema_name = cmd.name.clone();
        let full_name = format!("{}.{}", catalog_name, schema_name);
        let info = self.repo.create(cmd).await?;
        self.authorizer.grant(principal, SecurableType::Schema, &full_name, Privilege::Owner).await?;
        self.authorizer.add_hierarchy(SecurableType::Schema, &full_name, SecurableType::Catalog, &catalog_name).await?;
        Ok(info)
    }

    async fn list_schemas(&self, principal: &str, catalog_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListSchemasResponse, DomainError> {
        let response = self.repo.list(catalog_name, max_results, page_token).await?;
        let next_page_token = response.next_page_token;
        let catalog_owner = self.authorizer
            .is_authorized(principal, SecurableType::Catalog, catalog_name, Privilege::Owner)
            .await
            .unwrap_or(false);
        let mut allowed = Vec::new();
        for schema in response.schemas {
            let ok = if catalog_owner {
                true
            } else {
                self.authorizer
                    .is_authorized_any(principal, SecurableType::Schema, &schema.full_name, &[Privilege::Owner, Privilege::UseSchema])
                    .await
                    .unwrap_or(false)
            };
            if ok {
                allowed.push(schema);
            }
        }
        Ok(ListSchemasResponse {
            schemas: allowed,
            next_page_token,
        })
    }

    async fn get_schema(&self, principal: &str, full_name: &str) -> Result<SchemaInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized_any(principal, SecurableType::Schema, full_name, &[Privilege::Owner, Privilege::UseSchema])
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.repo.get(full_name).await
    }

    async fn update_schema(&self, principal: &str, full_name: &str, cmd: UpdateSchema) -> Result<SchemaInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::Schema, full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.repo.update(full_name, cmd).await
    }

    async fn delete_schema(&self, principal: &str, full_name: &str, force: bool) -> Result<(), DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::Schema, full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.repo.delete(full_name, force).await?;
        self.authorizer.remove_object(SecurableType::Schema, full_name).await?;
        Ok(())
    }
}
