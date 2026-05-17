CREATE TABLE users
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL,
    username   TEXT        NOT NULL,
    full_name  TEXT        NOT NULL DEFAULT '',
    roles      TEXT[]      NOT NULL DEFAULT '{}',
    user_type  TEXT        NOT NULL DEFAULT 'USER' CHECK (user_type IN ('GROUP', 'USER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_idx ON users (email);

CREATE TABLE teams
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    workspace  TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX teams_name_idx ON teams (name);

CREATE TABLE policy_templates
(
    id            UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    scope         TEXT        NOT NULL,
    resource      TEXT,
    team_ids      UUID[]      NOT NULL DEFAULT '{}',
    privileges    TEXT[]      NOT NULL DEFAULT '{}',
    approval_mode TEXT        NOT NULL DEFAULT 'review',
    risk          TEXT        NOT NULL DEFAULT 'low',
    usage_30d     INTEGER     NOT NULL DEFAULT 0,
    owner_id      UUID        NOT NULL REFERENCES teams (id),
    last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permission_requests
(
    id                 UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    requester_id       UUID        NOT NULL REFERENCES users (id),
    team               UUID        NOT NULL REFERENCES teams (id),
    resource           TEXT        NOT NULL,
    scope              TEXT        NOT NULL,
    privileges         TEXT[]      NOT NULL DEFAULT '{}',
    submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'pending',
    reviewer_id        UUID        NOT NULL REFERENCES teams (id),
    rationale          TEXT        NOT NULL DEFAULT '',
    risk               TEXT        NOT NULL DEFAULT 'low',
    policy_template_id UUID REFERENCES policy_templates (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE blast_radius_previews
(
    request_id            UUID PRIMARY KEY REFERENCES permission_requests (id) ON DELETE CASCADE,
    downstream_assets     INTEGER     NOT NULL DEFAULT 0,
    dashboards            INTEGER     NOT NULL DEFAULT 0,
    consumers             INTEGER     NOT NULL DEFAULT 0,
    sensitive_domains     TEXT[]      NOT NULL DEFAULT '{}',
    recommended_guardrail TEXT        NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE time_bound_grants
(
    id             UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    principal      TEXT        NOT NULL,
    team           TEXT        NOT NULL,
    resource       TEXT        NOT NULL,
    privilege      TEXT        NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    reviewer_id    TEXT        NOT NULL,
    renewal_status TEXT        NOT NULL DEFAULT 'healthy',
    reason         TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (id, email, username, full_name, user_type)
VALUES ('4faec421-980b-40e7-9997-ce2488ac5968', 'linh@gmail.com', 'linh', 'Linh Tran', 'USER'),
       ('f6138570-3008-4bcd-8c32-8ae72fce2ac7', 'khaosoi@gmail.com', 'khaosoi', 'Khao Soi', 'USER'),
       ('590df6ab-a6d9-418c-b89e-8ed3a26cdc7e', 'khaopad@gmail.com', 'khaopad', 'Khao Pad', 'USER'),
       ('508f5a7a-f4b4-421a-bbb0-5968f710bd50', 'rikki@gmail.com', 'rikki', 'Rikki Tarczaly', 'USER');

INSERT INTO teams (id, name, workspace)
VALUES ('10000000-0000-0000-0000-000000000001', 'VietJetair Analytics', 'vietjetair'),
       ('10000000-0000-0000-0000-000000000002', 'VietJetair Data Platform', 'vietjetair'),
       ('10000000-0000-0000-0000-000000000003', 'HDBank Risk Analytics', 'hdbank'),
       ('10000000-0000-0000-0000-000000000004', 'HDBank Data Steward', 'hdbank'),
       ('10000000-0000-0000-0000-000000000005', 'HDBank Security', 'hdbank'),
       ('10000000-0000-0000-0000-000000000006', 'Partnership Data Platform', 'partnership_sandbox');

INSERT INTO policy_templates (id, name, scope, resource, team_ids, privileges, approval_mode, risk, usage_30d, owner_id,
                              last_updated)
VALUES ('40000000-0000-0000-0000-000000000001', 'VietJet sandbox read', 'schema',
        'vietjetair_sandbox.vietjetair_bookings_sandbox_gold',
        ARRAY ['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000002'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'auto', 'low', 18, '10000000-0000-0000-0000-000000000002',
        '2026-05-12T09:00:00Z'),
       ('40000000-0000-0000-0000-000000000002', 'HDBank payments read', 'schema',
        'hdbank.hdbank_payments_prod_gold',
        ARRAY ['10000000-0000-0000-0000-000000000003'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'review', 'medium', 11, '10000000-0000-0000-0000-000000000004',
        '2026-05-10T05:10:00Z'),
       ('40000000-0000-0000-0000-000000000003', 'Partner analytics read', 'schema',
        'partnership_sandbox.analytics',
        ARRAY ['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000006'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'review', 'medium', 7, '10000000-0000-0000-0000-000000000006',
        '2026-05-11T07:45:00Z'),
       ('40000000-0000-0000-0000-000000000004', 'HDBank chargeback writeback', 'table',
        'hdbank.hdbank_payments_prod_gold.risk_detection_v1',
        ARRAY ['10000000-0000-0000-0000-000000000003'::uuid],
        ARRAY ['SELECT','MODIFY'], 'escalate', 'high', 4, '10000000-0000-0000-0000-000000000005',
        '2026-05-14T02:20:00Z');

INSERT INTO permission_requests (id, requester_id, team, resource, scope, privileges, submitted_at, expires_at, status,
                                 reviewer_id, rationale, risk, policy_template_id)
VALUES ('30000000-0000-0000-0000-000000001042', '590df6ab-a6d9-418c-b89e-8ed3a26cdc7e',
        '10000000-0000-0000-0000-000000000003', 'hdbank.hdbank_payments_prod_gold.risk_detection_v1', 'table',
        ARRAY ['SELECT','MODIFY'], '2026-05-16T01:12:00Z', '2026-05-17T01:12:00Z', 'pending',
        '10000000-0000-0000-0000-000000000004',
        'Temporary write access is needed to validate chargeback risk thresholds before the next fraud release.',
        'high', '40000000-0000-0000-0000-000000000004'),
       ('30000000-0000-0000-0000-000000001041', '4faec421-980b-40e7-9997-ce2488ac5968',
        '10000000-0000-0000-0000-000000000001', 'partnership_sandbox.analytics', 'schema',
        ARRAY ['USE_SCHEMA','SELECT'], '2026-05-15T06:30:00Z', '2026-05-21T06:30:00Z', 'ready',
        '10000000-0000-0000-0000-000000000006',
        'Preparing a joint VietJet and HDBank partner performance readout for the weekly business review.',
        'medium', '40000000-0000-0000-0000-000000000003'),
       ('30000000-0000-0000-0000-000000001039', 'f6138570-3008-4bcd-8c32-8ae72fce2ac7',
        '10000000-0000-0000-0000-000000000001', 'vietjetair_sandbox.vietjetair_bookings_sandbox_gold', 'schema',
        ARRAY ['USE_SCHEMA','SELECT'], '2026-05-14T10:00:00Z', '2026-05-30T10:00:00Z', 'approved',
        '10000000-0000-0000-0000-000000000002',
        'Sandbox access for route-performance experimentation during the fare optimization sprint.', 'low',
        '40000000-0000-0000-0000-000000000001'),
       ('30000000-0000-0000-0000-000000001038', '4faec421-980b-40e7-9997-ce2488ac5968',
        '10000000-0000-0000-0000-000000000006', 'hdbank.hdbank_payments_prod_gold', 'schema',
        ARRAY ['USE_SCHEMA','SELECT'], '2026-05-14T02:48:00Z', '2026-05-19T02:48:00Z', 'needs-info',
        '10000000-0000-0000-0000-000000000004',
        'Platform support needs temporary read access to troubleshoot an HDBank production quality regression.',
        'medium', '40000000-0000-0000-0000-000000000002'),
       ('30000000-0000-0000-0000-000000001036', '508f5a7a-f4b4-421a-bbb0-5968f710bd50',
        '10000000-0000-0000-0000-000000000002', 'vietjetair.vietjetair_bookings_prod_gold.customer_spend_v1', 'table',
        ARRAY ['SELECT'], '2026-05-13T08:15:00Z', '2026-05-18T08:15:00Z', 'pending',
        '10000000-0000-0000-0000-000000000002',
        'Incident response needs a temporary read path to verify a customer spend anomaly in production.', 'medium',
        NULL);

INSERT INTO blast_radius_previews (request_id, downstream_assets, dashboards, consumers, sensitive_domains,
                                   recommended_guardrail)
VALUES ('30000000-0000-0000-0000-000000001042', 14, 6, 3, ARRAY ['payments','fraud'],
        'Time-box to 24 hours and block export permissions.'),
       ('30000000-0000-0000-0000-000000001041', 9, 4, 2, ARRAY ['partner-analytics'],
        'Restrict reads to the analytics schema and log downstream extracts.'),
       ('30000000-0000-0000-0000-000000001038', 11, 2, 4, ARRAY ['payments','customer'],
        'Require ticket reference and keep access read-only.'),
       ('30000000-0000-0000-0000-000000001036', 7, 3, 2, ARRAY ['revenue'],
        'Mirror reads to the audit log and expire within five days.');

INSERT INTO time_bound_grants (id, principal, team, resource, privilege, started_at, expires_at, reviewer_id,
                               renewal_status, reason)
VALUES ('50000000-0000-0000-0000-000000000001', 'Khao Pad', 'HDBank Risk Analytics',
        'hdbank.hdbank_payments_prod_gold.risk_detection_v1', 'MODIFY',
        '2026-05-15T00:00:00Z', '2026-05-17T00:00:00Z', 'HDBank Security', 'expiring',
        'Chargeback tuning window before the next fraud-model deployment.'),
       ('50000000-0000-0000-0000-000000000002', 'Khao Soi', 'VietJetair Analytics',
        'vietjetair_sandbox.vietjetair_bookings_sandbox_gold', 'USE_SCHEMA',
        '2026-05-10T00:00:00Z', '2026-05-18T00:00:00Z', 'VietJetair Data Platform', 'healthy',
        'Route-performance experimentation in the VietJet sandbox workspace.'),
       ('50000000-0000-0000-0000-000000000003', 'Linh Tran', 'Partnership Data Platform',
        'partnership_sandbox.analytics', 'USE_SCHEMA',
        '2026-05-09T00:00:00Z', '2026-05-16T00:00:00Z', 'Partnership Data Platform', 'expired',
        'Backfill support for the partner analytics workspace.'),
       ('50000000-0000-0000-0000-000000000004', 'Rikki Tarczaly', 'VietJetair Data Platform',
        'vietjetair.vietjetair_bookings_prod_gold.customer_spend_v1', 'SELECT',
        '2026-05-12T00:00:00Z', '2026-05-22T00:00:00Z', 'VietJetair Data Platform', 'healthy',
        'Production incident review for the VietJet customer spend mart.');
