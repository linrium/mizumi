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

    fn ancestor_usage_grants(
        securable_type: &SecurableType,
        full_name: &str,
    ) -> Vec<(SecurableType, String, Privilege)> {
        if !matches!(securable_type, SecurableType::Table) {
            return Vec::new();
        }

        let mut parts = full_name.split('.');
        let Some(catalog) = parts.next() else {
            return Vec::new();
        };
        let Some(schema) = parts.next() else {
            return Vec::new();
        };
        if parts.next().is_none() {
            return Vec::new();
        }

        let schema_full = format!("{catalog}.{schema}");
        vec![
            (
                SecurableType::Catalog,
                catalog.to_string(),
                Privilege::UseCatalog,
            ),
            (SecurableType::Schema, schema_full, Privilege::UseSchema),
        ]
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
            if !change.add.is_empty() {
                for (ancestor_type, ancestor_name, ancestor_privilege) in
                    Self::ancestor_usage_grants(&securable_type, full_name)
                {
                    self.authorizer
                        .grant(
                            &change.principal,
                            ancestor_type,
                            &ancestor_name,
                            ancestor_privilege,
                        )
                        .await?;
                }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        error::DomainError,
        permissions::{PermissionsChange, UpdatePermissions},
    };
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct RecordingAuthorizer {
        grants: Mutex<Vec<(String, SecurableType, String, Privilege)>>,
    }

    #[async_trait]
    impl AuthorizerPort for RecordingAuthorizer {
        async fn is_authorized(
            &self,
            _principal: &str,
            _securable_type: SecurableType,
            _object_id: &str,
            _privilege: Privilege,
        ) -> Result<bool, DomainError> {
            Ok(true)
        }

        async fn is_authorized_any(
            &self,
            _principal: &str,
            _securable_type: SecurableType,
            _object_id: &str,
            _privileges: &[Privilege],
        ) -> Result<bool, DomainError> {
            Ok(true)
        }

        async fn is_authorized_all(
            &self,
            _principal: &str,
            _securable_type: SecurableType,
            _object_id: &str,
            _privileges: &[Privilege],
        ) -> Result<bool, DomainError> {
            Ok(true)
        }

        async fn grant(
            &self,
            principal: &str,
            securable_type: SecurableType,
            object_id: &str,
            privilege: Privilege,
        ) -> Result<(), DomainError> {
            self.grants.lock().unwrap().push((
                principal.to_string(),
                securable_type,
                object_id.to_string(),
                privilege,
            ));
            Ok(())
        }

        async fn revoke(
            &self,
            _principal: &str,
            _securable_type: SecurableType,
            _object_id: &str,
            _privilege: Privilege,
        ) -> Result<(), DomainError> {
            Ok(())
        }

        async fn list_grants(
            &self,
            _securable_type: SecurableType,
            _object_id: &str,
        ) -> Result<PermissionsList, DomainError> {
            Ok(PermissionsList {
                privilege_assignments: vec![],
            })
        }

        async fn add_hierarchy(
            &self,
            _child_type: SecurableType,
            _child_id: &str,
            _parent_type: SecurableType,
            _parent_id: &str,
        ) -> Result<(), DomainError> {
            Ok(())
        }

        async fn remove_object(
            &self,
            _securable_type: SecurableType,
            _object_id: &str,
        ) -> Result<(), DomainError> {
            Ok(())
        }

        async fn list_grants_for_principal(
            &self,
            _principal: &str,
            _securable_type: SecurableType,
            _object_id: &str,
        ) -> Result<Vec<Privilege>, DomainError> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn table_permission_update_adds_catalog_and_schema_usage() {
        let authorizer = Arc::new(RecordingAuthorizer::default());
        let service = PermissionService::new(authorizer.clone());

        let changes = UpdatePermissions {
            changes: vec![PermissionsChange {
                principal: "alice".to_string(),
                add: vec![Privilege::Select],
                remove: vec![],
            }],
        };

        service
            .update_permissions(
                "owner",
                SecurableType::Table,
                "main.analytics.orders",
                changes,
            )
            .await
            .unwrap();

        let grants = authorizer.grants.lock().unwrap().clone();
        assert_eq!(
            grants,
            vec![
                (
                    "alice".to_string(),
                    SecurableType::Table,
                    "main.analytics.orders".to_string(),
                    Privilege::Select,
                ),
                (
                    "alice".to_string(),
                    SecurableType::Catalog,
                    "main".to_string(),
                    Privilege::UseCatalog,
                ),
                (
                    "alice".to_string(),
                    SecurableType::Schema,
                    "main.analytics".to_string(),
                    Privilege::UseSchema,
                ),
            ]
        );
    }
}
