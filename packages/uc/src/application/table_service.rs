use std::sync::Arc;
use async_trait::async_trait;
use crate::domain::{
    entities::table::*,
    error::DomainError,
    permissions::{Privilege, SecurableType},
    ports::{
        inbound::TableUseCase,
        outbound::{AuthorizerPort, TableRepository},
    },
};

pub struct TableService {
    repo: Arc<dyn TableRepository>,
    authorizer: Arc<dyn AuthorizerPort>,
}

impl TableService {
    pub fn new(repo: Arc<dyn TableRepository>, authorizer: Arc<dyn AuthorizerPort>) -> Self {
        Self { repo, authorizer }
    }
}

#[async_trait]
impl TableUseCase for TableService {
    async fn create_table(&self, principal: &str, cmd: CreateTable) -> Result<TableInfo, DomainError> {
        let catalog_name = cmd.catalog_name.clone();
        let schema_name = cmd.schema_name.clone();
        let schema_full = format!("{}.{}", catalog_name, schema_name);

        // Catalog: must have OWNER or USE_CATALOG
        let cat_ok = self.authorizer
            .is_authorized_any(principal, SecurableType::Catalog, &catalog_name, &[Privilege::Owner, Privilege::UseCatalog])
            .await?;
        if !cat_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, catalog_name
            )));
        }
        // Schema: must have OWNER OR (USE_SCHEMA + CREATE_TABLE)
        let schema_owner = self.authorizer
            .is_authorized(principal, SecurableType::Schema, &schema_full, Privilege::Owner)
            .await?;
        let schema_ok = if !schema_owner {
            self.authorizer
                .is_authorized_all(principal, SecurableType::Schema, &schema_full, &[Privilege::UseSchema, Privilege::CreateTable])
                .await?
        } else {
            true
        };
        if !schema_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, schema_full
            )));
        }

        let table_name = cmd.name.clone();
        let full_name = format!("{}.{}", schema_full, table_name);
        let info = self.repo.create(cmd).await?;
        self.authorizer.grant(principal, SecurableType::Table, &full_name, Privilege::Owner).await?;
        self.authorizer.add_hierarchy(SecurableType::Table, &full_name, SecurableType::Schema, &schema_full).await?;
        Ok(info)
    }

    async fn list_tables(&self, principal: &str, catalog_name: &str, schema_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListTablesResponse, DomainError> {
        let response = self.repo.list(catalog_name, schema_name, max_results, page_token).await?;
        let next_page_token = response.next_page_token;
        let schema_full = format!("{}.{}", catalog_name, schema_name);
        let schema_owner = self.authorizer
            .is_authorized(principal, SecurableType::Schema, &schema_full, Privilege::Owner)
            .await
            .unwrap_or(false);
        let mut allowed = Vec::new();
        for table in response.tables {
            let ok = if schema_owner {
                true
            } else {
                self.authorizer
                    .is_authorized_any(
                        principal,
                        SecurableType::Table,
                        &table.full_name,
                        &[Privilege::Owner, Privilege::Browse, Privilege::Select, Privilege::Modify],
                    )
                    .await
                    .unwrap_or(false)
            };
            if ok {
                allowed.push(table);
            }
        }
        Ok(ListTablesResponse {
            tables: allowed,
            next_page_token,
        })
    }

    async fn get_table(&self, principal: &str, full_name: &str) -> Result<TableInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized_any(
                principal,
                SecurableType::Table,
                full_name,
                &[Privilege::Owner, Privilege::Browse, Privilege::Select, Privilege::Modify],
            )
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.repo.get(full_name).await
    }

    async fn delete_table(&self, principal: &str, full_name: &str) -> Result<(), DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::Table, full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.repo.delete(full_name).await?;
        self.authorizer.remove_object(SecurableType::Table, full_name).await?;
        Ok(())
    }
}
