use crate::domain::{
    entities::catalog::*,
    error::DomainError,
    permissions::{Privilege, SecurableType},
    ports::{
        inbound::CatalogUseCase,
        outbound::{AuthorizerPort, CatalogRepository},
    },
};
use async_trait::async_trait;
use std::sync::Arc;

pub struct CatalogService {
    repo: Arc<dyn CatalogRepository>,
    authorizer: Arc<dyn AuthorizerPort>,
}

impl CatalogService {
    pub fn new(repo: Arc<dyn CatalogRepository>, authorizer: Arc<dyn AuthorizerPort>) -> Self {
        Self { repo, authorizer }
    }
}

#[async_trait]
impl CatalogUseCase for CatalogService {
    async fn create_catalog(
        &self,
        principal: &str,
        cmd: CreateCatalog,
    ) -> Result<CatalogInfo, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized_any(
                principal,
                SecurableType::Metastore,
                "metastore",
                &[Privilege::Owner, Privilege::CreateCatalog],
            )
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on metastore",
                principal
            )));
        }
        let catalog_name = cmd.name.clone();
        let info = self.repo.create(cmd).await?;
        self.authorizer
            .grant(
                principal,
                SecurableType::Catalog,
                &catalog_name,
                Privilege::Owner,
            )
            .await?;
        self.authorizer
            .add_hierarchy(
                SecurableType::Catalog,
                &catalog_name,
                SecurableType::Metastore,
                "metastore",
            )
            .await?;
        Ok(info)
    }

    async fn list_catalogs(
        &self,
        principal: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListCatalogsResponse, DomainError> {
        let response = self.repo.list(max_results, page_token).await?;
        let next_page_token = response.next_page_token;
        let mut allowed_catalogs = Vec::new();
        for catalog in response.catalogs {
            let ok = self
                .authorizer
                .is_authorized_any(
                    principal,
                    SecurableType::Catalog,
                    &catalog.name,
                    &[Privilege::Owner, Privilege::UseCatalog, Privilege::Browse],
                )
                .await
                .unwrap_or(false);
            if ok {
                allowed_catalogs.push(catalog);
            }
        }
        Ok(ListCatalogsResponse {
            catalogs: allowed_catalogs,
            next_page_token,
        })
    }

    async fn get_catalog(&self, principal: &str, name: &str) -> Result<CatalogInfo, DomainError> {
        let metastore_owner = self
            .authorizer
            .is_authorized(
                principal,
                SecurableType::Metastore,
                "metastore",
                Privilege::Owner,
            )
            .await?;
        let catalog_ok = self
            .authorizer
            .is_authorized_any(
                principal,
                SecurableType::Catalog,
                name,
                &[Privilege::Owner, Privilege::UseCatalog, Privilege::Browse],
            )
            .await?;
        if !metastore_owner && !catalog_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, name
            )));
        }
        self.repo.get(name).await
    }

    async fn update_catalog(
        &self,
        principal: &str,
        name: &str,
        cmd: UpdateCatalog,
    ) -> Result<CatalogInfo, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(principal, SecurableType::Catalog, name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, name
            )));
        }
        // If the catalog is being renamed, update hierarchy/grants key
        let new_name = cmd.new_name.clone();
        let info = self.repo.update(name, cmd).await?;
        if let Some(ref n) = new_name {
            if n != name {
                // Re-grant OWNER under new name and remove old entries
                self.authorizer
                    .grant(principal, SecurableType::Catalog, n, Privilege::Owner)
                    .await?;
                self.authorizer
                    .add_hierarchy(
                        SecurableType::Catalog,
                        n,
                        SecurableType::Metastore,
                        "metastore",
                    )
                    .await?;
                self.authorizer
                    .remove_object(SecurableType::Catalog, name)
                    .await?;
            }
        }
        Ok(info)
    }

    async fn delete_catalog(
        &self,
        principal: &str,
        name: &str,
        force: bool,
    ) -> Result<(), DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(principal, SecurableType::Catalog, name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}",
                principal, name
            )));
        }
        self.repo.delete(name, force).await?;
        self.authorizer
            .remove_object(SecurableType::Catalog, name)
            .await?;
        Ok(())
    }
}
