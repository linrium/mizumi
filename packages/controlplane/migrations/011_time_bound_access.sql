ALTER TABLE policy_templates
    ADD COLUMN max_grant_duration_days INTEGER NOT NULL DEFAULT 90
        CHECK (max_grant_duration_days > 0);

UPDATE policy_templates
SET max_grant_duration_days = 30
WHERE approval_mode = 'auto';

UPDATE policy_templates
SET max_grant_duration_days = 90
WHERE approval_mode = 'review';

UPDATE policy_templates
SET max_grant_duration_days = 14
WHERE approval_mode = 'escalate';

ALTER TABLE time_bound_grants
    ADD COLUMN source_request_id UUID REFERENCES permission_requests (id) ON DELETE SET NULL;

CREATE INDEX time_bound_grants_source_request_id_idx
    ON time_bound_grants (source_request_id);

ALTER TABLE time_bound_grants
    ADD CONSTRAINT time_bound_grants_unique_grant
        UNIQUE (source_request_id, principal, resource, privilege);
