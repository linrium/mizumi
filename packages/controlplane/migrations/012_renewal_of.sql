-- Link a renewal permission-request back to the original time_bound_grant.
ALTER TABLE permission_requests
    ADD COLUMN renewal_of UUID REFERENCES time_bound_grants (id) ON DELETE SET NULL;

CREATE INDEX permission_requests_renewal_of_idx
    ON permission_requests (renewal_of)
    WHERE renewal_of IS NOT NULL;

-- Store the UC scope (catalog/schema/table) alongside the grant so we can
-- revoke permissions without joining back to the originating request.
ALTER TABLE time_bound_grants
    ADD COLUMN scope TEXT NOT NULL DEFAULT '';
