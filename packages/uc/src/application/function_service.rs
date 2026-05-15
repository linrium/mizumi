use crate::domain::{
    entities::function::*,
    error::DomainError,
    permissions::{Privilege, SecurableType},
    ports::{
        inbound::FunctionUseCase,
        outbound::{AuthorizerPort, FunctionRepository},
    },
};
use async_trait::async_trait;
use std::sync::Arc;

pub struct FunctionService {
    repo: Arc<dyn FunctionRepository>,
    authorizer: Arc<dyn AuthorizerPort>,
}

impl FunctionService {
    pub fn new(repo: Arc<dyn FunctionRepository>, authorizer: Arc<dyn AuthorizerPort>) -> Self {
        Self { repo, authorizer }
    }
}

#[async_trait]
impl FunctionUseCase for FunctionService {
    async fn create_function(
        &self,
        principal: &str,
        cmd: CreateFunction,
    ) -> Result<FunctionInfo, DomainError> {
        let catalog_name = cmd.catalog_name.clone();
        let schema_name = cmd.schema_name.clone();
        let schema_full = format!("{}.{}", catalog_name, schema_name);

        let cat_ok = self
            .authorizer
            .is_authorized_any(
                principal,
                SecurableType::Catalog,
                &catalog_name,
                &[Privilege::Owner, Privilege::UseCatalog],
            )
            .await?;
        if !cat_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, catalog_name
            )));
        }
        let schema_owner = self
            .authorizer
            .is_authorized(
                principal,
                SecurableType::Schema,
                &schema_full,
                Privilege::Owner,
            )
            .await?;
        let schema_ok = if !schema_owner {
            self.authorizer
                .is_authorized_all(
                    principal,
                    SecurableType::Schema,
                    &schema_full,
                    &[Privilege::UseSchema, Privilege::CreateFunction],
                )
                .await?
        } else {
            true
        };
        if !schema_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, schema_full
            )));
        }

        let function_name = cmd.name.clone();
        let full_name = format!("{}.{}", schema_full, function_name);
        let info = self.repo.create(cmd).await?;
        self.authorizer
            .grant(
                principal,
                SecurableType::Function,
                &full_name,
                Privilege::Owner,
            )
            .await?;
        self.authorizer
            .add_hierarchy(
                SecurableType::Function,
                &full_name,
                SecurableType::Schema,
                &schema_full,
            )
            .await?;
        Ok(info)
    }

    async fn list_functions(
        &self,
        principal: &str,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListFunctionsResponse, DomainError> {
        let response = self
            .repo
            .list(catalog_name, schema_name, max_results, page_token)
            .await?;
        let next_page_token = response.next_page_token;
        let mut allowed = Vec::new();
        for function in response.functions {
            let ok = self
                .authorizer
                .is_authorized_any(
                    principal,
                    SecurableType::Function,
                    &function.full_name,
                    &[Privilege::Owner, Privilege::Execute],
                )
                .await
                .unwrap_or(false);
            if ok {
                allowed.push(function);
            }
        }
        Ok(ListFunctionsResponse {
            functions: allowed,
            next_page_token,
        })
    }

    async fn get_function(
        &self,
        principal: &str,
        full_name: &str,
    ) -> Result<FunctionInfo, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized_any(
                principal,
                SecurableType::Function,
                full_name,
                &[Privilege::Owner, Privilege::Execute],
            )
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, full_name
            )));
        }
        self.repo.get(full_name).await
    }

    async fn delete_function(&self, principal: &str, full_name: &str) -> Result<(), DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(
                principal,
                SecurableType::Function,
                full_name,
                Privilege::Owner,
            )
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, full_name
            )));
        }
        self.repo.delete(full_name).await?;
        self.authorizer
            .remove_object(SecurableType::Function, full_name)
            .await?;
        Ok(())
    }
}
