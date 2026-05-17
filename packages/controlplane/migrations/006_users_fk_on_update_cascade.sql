-- Allow users.id to be updated (e.g. when reconciling seed UUIDs with Keycloak subs)
-- by cascading the change to all referencing tables.

ALTER TABLE permission_requests
    DROP CONSTRAINT permission_requests_requester_id_fkey,
    ADD CONSTRAINT permission_requests_requester_id_fkey
        FOREIGN KEY (requester_id) REFERENCES users (id) ON UPDATE CASCADE;

ALTER TABLE team_members
    DROP CONSTRAINT team_members_user_id_fkey,
    ADD CONSTRAINT team_members_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE;
