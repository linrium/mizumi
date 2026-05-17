use crate::domain::{
    error::DomainError,
    permissions::{PermissionsList, Privilege, SecurableType, UpdatePermissions},
    ports::{
        inbound::PermissionUseCase,
        outbound::AuthorizerPort,
    },
};
use async_trait::async_trait;
use std::sync::Arc;

pub struct PermissionService {
    authorizer: Arc<dyn AuthorizerPort>,
}

impl PermissionService {
    pub fn new(authorizer: Arc<dyn AuthorizerPort>) -> Self {
        Self { authorizer }
    }
}

#[async_trait]
impl PermissionUseCase for PermissionService {
    async fn get_permissions(
        &self,
        principal: &str,
        securable_type: SecurableType,
        full_name: &str,
    ) -> Result<PermissionsList, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(
                principal,
                securable_type.clone(),
                full_name,
                Privilege::Owner,
            )
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(
                "Only owners can view permissions".to_string(),
            ));
        }
        self.authorizer.list_grants(securable_type, full_name).await
    }

    async fn update_permissions(
        &self,
        principal: &str,
        securable_type: SecurableType,
        full_name: &str,
        changes: UpdatePermissions,
    ) -> Result<PermissionsList, DomainError> {
        let allowed = self
            .authorizer
            .is_authorized(
                principal,
                securable_type.clone(),
                full_name,
                Privilege::Owner,
            )
            .await?;
        if !allowed {
            return Err(DomainError::Forbidden(
                "Only owners can modify permissions".to_string(),
            ));
        }
        for change in &changes.changes {
            for priv_ in &change.add {
                self.authorizer
                    .grant(
                        &change.principal,
                        securable_type.clone(),
                        full_name,
                        priv_.clone(),
                    )
                    .await?;
            }
            for priv_ in &change.remove {
                self.authorizer
                    .revoke(
                        &change.principal,
                        securable_type.clone(),
                        full_name,
                        priv_.clone(),
                    )
                    .await?;
            }
        }
        self.authorizer.list_grants(securable_type, full_name).await
    }

    async fn get_effective_privileges(
        &self,
        principal: &str,
        securable_type: SecurableType,
        full_name: &str,
    ) -> Result<Vec<Privilege>, DomainError> {
        self.authorizer
            .list_grants_for_principal(principal, securable_type, full_name)
            .await
    }
}
