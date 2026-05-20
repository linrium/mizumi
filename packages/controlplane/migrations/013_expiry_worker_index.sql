-- Partial index to speed up the expiry worker's two periodic scans:
--   1. list_overdue:        expires_at < NOW()  AND renewal_status NOT IN ('expired','revoked')
--   2. mark_expiring_soon:  expires_at < NOW() + 7d AND renewal_status = 'healthy'
CREATE INDEX time_bound_grants_expiry_idx
    ON time_bound_grants (expires_at)
    WHERE renewal_status NOT IN ('expired', 'revoked');
