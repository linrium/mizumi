ALTER TABLE permission_requests
    ADD COLUMN submit_as TEXT NOT NULL DEFAULT 'team'
        CHECK (submit_as IN ('personal', 'team'));

UPDATE permission_requests
SET submit_as = 'team';

ALTER TABLE permission_requests
    ALTER COLUMN team DROP NOT NULL;
