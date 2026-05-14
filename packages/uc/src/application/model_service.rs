use std::sync::Arc;
use async_trait::async_trait;
use crate::domain::{
    entities::model::*,
    error::DomainError,
    permissions::{Privilege, SecurableType},
    ports::{
        inbound::ModelUseCase,
        outbound::{AuthorizerPort, RegisteredModelRepository, ModelVersionRepository},
    },
};

pub struct ModelService {
    model_repo: Arc<dyn RegisteredModelRepository>,
    version_repo: Arc<dyn ModelVersionRepository>,
    authorizer: Arc<dyn AuthorizerPort>,
}

impl ModelService {
    pub fn new(
        model_repo: Arc<dyn RegisteredModelRepository>,
        version_repo: Arc<dyn ModelVersionRepository>,
        authorizer: Arc<dyn AuthorizerPort>,
    ) -> Self {
        Self { model_repo, version_repo, authorizer }
    }
}

#[async_trait]
impl ModelUseCase for ModelService {
    async fn create_registered_model(&self, principal: &str, cmd: CreateRegisteredModel) -> Result<RegisteredModelInfo, DomainError> {
        let catalog_name = cmd.catalog_name.clone();
        let schema_name = cmd.schema_name.clone();
        let schema_full = format!("{}.{}", catalog_name, schema_name);

        let cat_ok = self.authorizer
            .is_authorized_any(principal, SecurableType::Catalog, &catalog_name, &[Privilege::Owner, Privilege::UseCatalog])
            .await?;
        if !cat_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, catalog_name
            )));
        }
        let schema_owner = self.authorizer
            .is_authorized(principal, SecurableType::Schema, &schema_full, Privilege::Owner)
            .await?;
        let schema_ok = if !schema_owner {
            self.authorizer
                .is_authorized_all(principal, SecurableType::Schema, &schema_full, &[Privilege::UseSchema, Privilege::CreateModel])
                .await?
        } else {
            true
        };
        if !schema_ok {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, schema_full
            )));
        }

        let model_name = cmd.name.clone();
        let full_name = format!("{}.{}", schema_full, model_name);
        let info = self.model_repo.create(cmd).await?;
        self.authorizer.grant(principal, SecurableType::RegisteredModel, &full_name, Privilege::Owner).await?;
        self.authorizer.add_hierarchy(SecurableType::RegisteredModel, &full_name, SecurableType::Schema, &schema_full).await?;
        Ok(info)
    }

    async fn list_registered_models(&self, principal: &str, catalog_name: &str, schema_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListRegisteredModelsResponse, DomainError> {
        let response = self.model_repo.list(catalog_name, schema_name, max_results, page_token).await?;
        let next_page_token = response.next_page_token;
        let mut allowed = Vec::new();
        for model in response.registered_models {
            let ok = self.authorizer
                .is_authorized_any(principal, SecurableType::RegisteredModel, &model.full_name, &[Privilege::Owner, Privilege::Execute])
                .await
                .unwrap_or(false);
            if ok {
                allowed.push(model);
            }
        }
        Ok(ListRegisteredModelsResponse {
            registered_models: allowed,
            next_page_token,
        })
    }

    async fn get_registered_model(&self, principal: &str, full_name: &str) -> Result<RegisteredModelInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized_any(principal, SecurableType::RegisteredModel, full_name, &[Privilege::Owner, Privilege::Execute])
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.model_repo.get(full_name).await
    }

    async fn update_registered_model(&self, principal: &str, full_name: &str, cmd: UpdateRegisteredModel) -> Result<RegisteredModelInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::RegisteredModel, full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.model_repo.update(full_name, cmd).await
    }

    async fn delete_registered_model(&self, principal: &str, full_name: &str) -> Result<(), DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::RegisteredModel, full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, full_name
            )));
        }
        self.model_repo.delete(full_name).await?;
        self.authorizer.remove_object(SecurableType::RegisteredModel, full_name).await?;
        Ok(())
    }

    async fn create_model_version(&self, principal: &str, cmd: CreateModelVersion) -> Result<ModelVersionInfo, DomainError> {
        let model_full = format!("{}.{}.{}", cmd.catalog_name, cmd.schema_name, cmd.model_name);
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::RegisteredModel, &model_full, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, model_full
            )));
        }
        self.version_repo.create(cmd).await
    }

    async fn list_model_versions(&self, principal: &str, model_full_name: &str, max_results: Option<i32>, page_token: Option<String>) -> Result<ListModelVersionsResponse, DomainError> {
        let allowed = self.authorizer
            .is_authorized_any(principal, SecurableType::RegisteredModel, model_full_name, &[Privilege::Owner, Privilege::Execute])
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, model_full_name
            )));
        }
        self.version_repo.list(model_full_name, max_results, page_token).await
    }

    async fn get_model_version(&self, principal: &str, model_full_name: &str, version: i64) -> Result<ModelVersionInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized_any(principal, SecurableType::RegisteredModel, model_full_name, &[Privilege::Owner, Privilege::Execute])
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, model_full_name
            )));
        }
        self.version_repo.get(model_full_name, version).await
    }

    async fn update_model_version(&self, principal: &str, model_full_name: &str, version: i64, cmd: UpdateModelVersion) -> Result<ModelVersionInfo, DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::RegisteredModel, model_full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, model_full_name
            )));
        }
        self.version_repo.update(model_full_name, version, cmd).await
    }

    async fn delete_model_version(&self, principal: &str, model_full_name: &str, version: i64) -> Result<(), DomainError> {
        let allowed = self.authorizer
            .is_authorized(principal, SecurableType::RegisteredModel, model_full_name, Privilege::Owner)
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(format!(
                "Principal {} is not authorized to perform this action on {}", principal, model_full_name
            )));
        }
        self.version_repo.delete(model_full_name, version).await
    }
}
