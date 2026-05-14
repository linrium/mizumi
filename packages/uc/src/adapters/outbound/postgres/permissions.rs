use std::sync::Arc;
use async_trait::async_trait;
use std::collections::HashMap;
use crate::domain::{
    error::DomainError,
    permissions::{Privilege, SecurableType, PermissionsList, PrivilegeAssignment},
    ports::outbound::AuthorizerPort,
};

pub struct PgAuthorizer {
    pool: Arc<sqlx::PgPool>,
}

impl PgAuthorizer {
    pub fn new(pool: Arc<sqlx::PgPool>) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct GrantRow {
    principal: String,
    privilege: String,
}

#[async_trait]
impl AuthorizerPort for PgAuthorizer {
    async fn is_authorized(
        &self,
        principal: &str,
        securable_type: SecurableType,
        object_id: &str,
        privilege: Privilege,
    ) -> Result<bool, DomainError> {
        if principal == "admin" {
            return Ok(true);
        }

        let stype = securable_type.as_str();
        let priv_str = privilege.as_str();

        // Check direct OWNER or requested privilege on the object
        let direct: Option<bool> = sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1 FROM uc_grants
                WHERE securable_type = $1
                  AND securable_id = $2
                  AND principal = $3
                  AND (privilege = 'OWNER' OR privilege = $4)
            )",
        )
        .bind(stype)
        .bind(object_id)
        .bind(principal)
        .bind(priv_str)
        .fetch_one(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        if direct.unwrap_or(false) {
            return Ok(true);
        }

        // Walk ancestors and check OWNER on any ancestor
        let ancestor_owned: Option<bool> = sqlx::query_scalar(
            r#"
            WITH RECURSIVE ancestors AS (
                SELECT parent_type, parent_id
                FROM uc_hierarchy
                WHERE child_type = $1 AND child_id = $2
                UNION ALL
                SELECT h.parent_type, h.parent_id
                FROM uc_hierarchy h
                INNER JOIN ancestors a ON h.child_type = a.parent_type AND h.child_id = a.parent_id
            )
            SELECT EXISTS(
                SELECT 1 FROM uc_grants g
                JOIN ancestors a ON g.securable_type = a.parent_type AND g.securable_id = a.parent_id
                WHERE g.principal = $3 AND g.privilege = 'OWNER'
            )
            "#,
        )
        .bind(stype)
        .bind(object_id)
        .bind(principal)
        .fetch_one(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        Ok(ancestor_owned.unwrap_or(false))
    }

    async fn is_authorized_any(
        &self,
        principal: &str,
        securable_type: SecurableType,
        object_id: &str,
        privileges: &[Privilege],
    ) -> Result<bool, DomainError> {
        for priv_ in privileges {
            if self
                .is_authorized(principal, securable_type.clone(), object_id, priv_.clone())
                .await?
            {
                return Ok(true);
            }
        }
        Ok(false)
    }

    async fn is_authorized_all(
        &self,
        principal: &str,
        securable_type: SecurableType,
        object_id: &str,
        privileges: &[Privilege],
    ) -> Result<bool, DomainError> {
        for priv_ in privileges {
            if !self
                .is_authorized(principal, securable_type.clone(), object_id, priv_.clone())
                .await?
            {
                return Ok(false);
            }
        }
        Ok(true)
    }

    async fn grant(
        &self,
        principal: &str,
        securable_type: SecurableType,
        object_id: &str,
        privilege: Privilege,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO uc_grants (securable_type, securable_id, principal, privilege)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING",
        )
        .bind(securable_type.as_str())
        .bind(object_id)
        .bind(principal)
        .bind(privilege.as_str())
        .execute(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
        Ok(())
    }

    async fn revoke(
        &self,
        principal: &str,
        securable_type: SecurableType,
        object_id: &str,
        privilege: Privilege,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "DELETE FROM uc_grants
             WHERE securable_type = $1 AND securable_id = $2 AND principal = $3 AND privilege = $4",
        )
        .bind(securable_type.as_str())
        .bind(object_id)
        .bind(principal)
        .bind(privilege.as_str())
        .execute(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
        Ok(())
    }

    async fn list_grants(
        &self,
        securable_type: SecurableType,
        object_id: &str,
    ) -> Result<PermissionsList, DomainError> {
        let rows: Vec<GrantRow> = sqlx::query_as::<_, GrantRow>(
            "SELECT principal, privilege FROM uc_grants
             WHERE securable_type = $1 AND securable_id = $2
             ORDER BY principal",
        )
        .bind(securable_type.as_str())
        .bind(object_id)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;

        let mut map: HashMap<String, Vec<Privilege>> = HashMap::new();
        for row in rows {
            if let Ok(priv_) = row.privilege.parse::<Privilege>() {
                map.entry(row.principal).or_default().push(priv_);
            }
        }

        let privilege_assignments = map
            .into_iter()
            .map(|(principal, privileges)| PrivilegeAssignment { principal, privileges })
            .collect();

        Ok(PermissionsList { privilege_assignments })
    }

    async fn add_hierarchy(
        &self,
        child_type: SecurableType,
        child_id: &str,
        parent_type: SecurableType,
        parent_id: &str,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO uc_hierarchy (child_type, child_id, parent_type, parent_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING",
        )
        .bind(child_type.as_str())
        .bind(child_id)
        .bind(parent_type.as_str())
        .bind(parent_id)
        .execute(&*self.pool)
        .await
        .map_err(|e| DomainError::Internal(e.to_string()))?;
        Ok(())
    }

    async fn remove_object(
        &self,
        securable_type: SecurableType,
        object_id: &str,
    ) -> Result<(), DomainError> {
        let stype = securable_type.as_str();
        sqlx::query("DELETE FROM uc_grants WHERE securable_type = $1 AND securable_id = $2")
            .bind(stype)
            .bind(object_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;
        sqlx::query("DELETE FROM uc_hierarchy WHERE child_type = $1 AND child_id = $2")
            .bind(stype)
            .bind(object_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| DomainError::Internal(e.to_string()))?;
        Ok(())
    }
}

/// No-op authorizer: always allows everything. Used when authorization is disabled.
pub struct NoOpAuthorizer;

#[async_trait]
impl AuthorizerPort for NoOpAuthorizer {
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
        _principal: &str,
        _securable_type: SecurableType,
        _object_id: &str,
        _privilege: Privilege,
    ) -> Result<(), DomainError> {
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
}
