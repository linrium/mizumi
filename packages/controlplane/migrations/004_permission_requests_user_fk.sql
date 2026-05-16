ALTER TABLE permission_requests
    ADD CONSTRAINT fk_permission_requests_requester_id
    FOREIGN KEY (requester_id) REFERENCES users(id);
