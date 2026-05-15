use crate::domain::{
    entities::volume::*,
    error::DomainError,
    permissions::{Privilege, SecurableType},
    ports::{
        inbound::VolumeUseCase,
        outbound::{AuthorizerPort, VolumeRepository},
    },
};
use async_trait::async_trait;
use std::sync::Arc;

pub struct VolumeService {
    repo: Arc<dyn VolumeRepository>,
    authorizer: Arc<dyn AuthorizerPort>,
}

impl VolumeService {
    pub fn new(repo: Arc<dyn VolumeRepository>, authorizer: Arc<dyn AuthorizerPort>) -> Self {
        Self { repo, authorizer }
    }
}

#[async_trait]
impl VolumeUseCase for VolumeService {
    async fn create_volume(
        &self,
        principal: &str,
        cmd: CreateVolume,
    ) -> Result<VolumeInfo, DomainError> {
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
                    &[Privilege::UseSchema, Privilege::CreateVolume],
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

        let volume_name = cmd.name.clone();
        let full_name = format!("{}.{}", schema_full, volume_name);
        let info = self.repo.create(cmd).await?;
        self.authorizer
            .grant(
                principal,
                SecurableType::Volume,
                &full_name,
                Privilege::Owner,
            )
            .await?;
        self.authorizer
            .add_hierarchy(
                SecurableType::Volume,
                &full_name,
                SecurableType::Schema,
                &schema_full,
            )
            .await?;
        Ok(info)
    }

    async fn list_volumes(
        &self,
        principal: &str,
        catalog_name: &str,
        schema_name: &str,
        max_results: Option<i32>,
        page_token: Option<String>,
    ) -> Result<ListVolumesResponse, DomainError> {
        let response = self
            .repo
            .list(catalog_name, schema_name, max_results, page_token)
            .await?;
        let next_page_token = response.next_page_token;
        let mut allowed = Vec::new();
        for volume in response.volumes {
            let ok = self
                .authorizer
                .is_authorized_any(
                    principal,
                    SecurableType::Volume,
                    &volume.full_name,
                    &[Privilege::Owner, Privilege::ReadVolume],
                )
                .await
                .unwrap_or(false);
            if ok {
                allowed.push(volume);
            }
        }
        Ok(ListVolumesResponse {
            volumes: allowed,
            next_page_token,
        })
    }

    async fn get_volume(
        &self,
        principal: &str,
        full_name: &str,
    ) -> Result<VolumeInfo, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized_any(
                principal,
                SecurableType::Volume,
                full_name,
                &[Privilege::Owner, Privilege::ReadVolume],
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

    async fn update_volume(
        &self,
        principal: &str,
        full_name: &str,
        cmd: UpdateVolume,
    ) -> Result<VolumeInfo, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(
                principal,
                SecurableType::Volume,
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
        self.repo.update(full_name, cmd).await
    }

    async fn delete_volume(&self, principal: &str, full_name: &str) -> Result<(), DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(
                principal,
                SecurableType::Volume,
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
            .remove_object(SecurableType::Volume, full_name)
            .await?;
        Ok(())
    }
}
