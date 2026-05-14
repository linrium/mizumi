CREATE TABLE IF NOT EXISTS uc_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    securable_type VARCHAR NOT NULL,
    securable_id VARCHAR NOT NULL,
    principal VARCHAR NOT NULL,
    privilege VARCHAR NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(securable_type, securable_id, principal, privilege)
);

CREATE INDEX IF NOT EXISTS idx_uc_grants_principal_object
    ON uc_grants (principal, securable_type, securable_id, privilege);
CREATE INDEX IF NOT EXISTS idx_uc_grants_object
    ON uc_grants (securable_type, securable_id);

CREATE TABLE IF NOT EXISTS uc_hierarchy (
    child_type VARCHAR NOT NULL,
    child_id VARCHAR NOT NULL,
    parent_type VARCHAR NOT NULL,
    parent_id VARCHAR NOT NULL,
    PRIMARY KEY (child_type, child_id)
);

CREATE INDEX IF NOT EXISTS idx_uc_hierarchy_parent
    ON uc_hierarchy (parent_type, parent_id);
