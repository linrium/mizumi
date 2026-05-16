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
VALUES ('20000000-0000-0000-0000-000000000001', 'annie.case@example.com', 'annie.case', 'Annie Case', 'USER'),
       ('20000000-0000-0000-0000-000000000002', 'mai.nguyen@example.com', 'mai.nguyen', 'Mai Nguyen', 'USER'),
       ('20000000-0000-0000-0000-000000000003', 'kenji.mori@example.com', 'kenji.mori', 'Kenji Mori', 'USER'),
       ('20000000-0000-0000-0000-000000000004', 'nora.patel@example.com', 'nora.patel', 'Nora Patel', 'USER'),
       ('20000000-0000-0000-0000-000000000005', 'bao.ho@example.com', 'bao.ho', 'Bao Ho', 'USER'),
       ('20000000-0000-0000-0000-000000000006', 'linh.vu@example.com', 'linh.vu', 'Linh Vu', 'USER'),
       ('20000000-0000-0000-0000-000000000007', 'haruto.sato@example.com', 'haruto.sato', 'Haruto Sato', 'USER');

INSERT INTO teams (id, name)
VALUES ('10000000-0000-0000-0000-000000000001', 'Fraud Ops'),
       ('10000000-0000-0000-0000-000000000002', 'Growth Analytics'),
       ('10000000-0000-0000-0000-000000000003', 'Finance BI'),
       ('10000000-0000-0000-0000-000000000004', 'ML Platform'),
       ('10000000-0000-0000-0000-000000000005', 'Operations'),
       ('10000000-0000-0000-0000-000000000006', 'Data Platform'),
       ('10000000-0000-0000-0000-000000000007', 'Executive Analytics'),
       ('10000000-0000-0000-0000-000000000008', 'Support Intelligence'),
       ('10000000-0000-0000-0000-000000000009', 'Governance'),
       ('10000000-0000-0000-0000-000000000010', 'Security'),
       ('10000000-0000-0000-0000-000000000011', 'Data Steward');

INSERT INTO policy_templates (id, name, scope, resource, team_ids, privileges, approval_mode, risk, usage_30d, owner_id,
                              last_updated)
VALUES ('40000000-0000-0000-0000-000000000001', 'Analytics read sandbox', 'schema', NULL,
        ARRAY ['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid,'10000000-0000-0000-0000-000000000007'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'auto', 'low', 28, '10000000-0000-0000-0000-000000000009',
        '2026-05-12T09:00:00Z'),
       ('40000000-0000-0000-0000-000000000002', 'Operational writeback', 'table', 'risk.gold_chargebacks',
        ARRAY ['10000000-0000-0000-0000-000000000005'::uuid,'10000000-0000-0000-0000-000000000001'::uuid],
        ARRAY ['SELECT','MODIFY'], 'review', 'high', 9, '10000000-0000-0000-0000-000000000011',
        '2026-05-09T15:30:00Z'),
       ('40000000-0000-0000-0000-000000000003', 'Catalog bootstrap', 'catalog', 'marketing',
        ARRAY ['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000004'::uuid],
        ARRAY ['USE_CATALOG','CREATE_SCHEMA'], 'review', 'medium', 6, '10000000-0000-0000-0000-000000000006',
        '2026-05-10T05:10:00Z'),
       ('40000000-0000-0000-0000-000000000004', 'Sensitive feature access', 'table',
        'feature_store.user_embeddings', ARRAY ['10000000-0000-0000-0000-000000000004'::uuid], ARRAY ['SELECT'],
        'escalate', 'high', 4, '10000000-0000-0000-0000-000000000010', '2026-05-14T02:20:00Z');

INSERT INTO permission_requests (id, requester_id, team, resource, scope, privileges, submitted_at, expires_at, status,
                                 reviewer_id, rationale, risk, policy_template_id)
VALUES ('30000000-0000-0000-0000-000000001042', '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001', 'risk.gold_chargebacks', 'table', ARRAY ['SELECT','MODIFY'],
        '2026-05-16T01:12:00Z', '2026-05-17T01:12:00Z', 'ready', '10000000-0000-0000-0000-000000000011',
        'Investigating a spike in dispute reversals for the Japan lane.', 'high',
        '40000000-0000-0000-0000-000000000002'),
       ('30000000-0000-0000-0000-000000001041', '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002', 'marketing', 'catalog', ARRAY ['USE_CATALOG','CREATE_SCHEMA'],
        '2026-05-15T06:30:00Z', '2026-05-21T06:30:00Z', 'ready', '10000000-0000-0000-0000-000000000006',
        'Standing up a campaign-attribution sandbox for a new partner.', 'medium',
        '40000000-0000-0000-0000-000000000003'),
       ('30000000-0000-0000-0000-000000001039', '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000003', 'finance.ap_closure', 'schema', ARRAY ['USE_SCHEMA','SELECT'],
        '2026-05-14T10:00:00Z', '2026-05-30T10:00:00Z', 'approved', '10000000-0000-0000-0000-000000000009',
        'Month-end close support for vendor accrual reconciliation.', 'low',
        '40000000-0000-0000-0000-000000000001'),
       ('30000000-0000-0000-0000-000000001038', '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000004', 'feature_store.user_embeddings', 'table', ARRAY ['SELECT'],
        '2026-05-14T02:48:00Z', '2026-05-19T02:48:00Z', 'needs-info', '10000000-0000-0000-0000-000000000010',
        'Model retraining run needs a narrower cohort definition.', 'medium',
        '40000000-0000-0000-0000-000000000004'),
       ('30000000-0000-0000-0000-000000001036', '20000000-0000-0000-0000-000000000005',
        '10000000-0000-0000-0000-000000000005', 'ops.runbooks', 'schema', ARRAY ['USE_SCHEMA','SELECT','MODIFY'],
        '2026-05-13T08:15:00Z', '2026-05-18T08:15:00Z', 'pending', '10000000-0000-0000-0000-000000000011',
        'Support rotation needs edit access for incident annotations.', 'high', NULL),
       ('30000000-0000-0000-0000-000000001034', '20000000-0000-0000-0000-000000000006',
        '10000000-0000-0000-0000-000000000007', 'board_metrics', 'catalog', ARRAY ['USE_CATALOG','CREATE_SCHEMA'],
        '2026-05-12T09:10:00Z', '2026-05-23T09:10:00Z', 'pending', '10000000-0000-0000-0000-000000000006',
        'Dedicated exec reporting workspace for Q2 operating review.', 'medium', NULL),
       ('30000000-0000-0000-0000-000000001031', '20000000-0000-0000-0000-000000000007',
        '10000000-0000-0000-0000-000000000008', 'support.ticket_embeddings', 'table', ARRAY ['SELECT'],
        '2026-05-11T23:40:00Z', '2026-05-25T23:40:00Z', 'pending', '10000000-0000-0000-0000-000000000010',
        'Case clustering pilot for deflection opportunities.', 'low', NULL);

INSERT INTO blast_radius_previews (request_id, downstream_assets, dashboards, consumers, sensitive_domains,
                                   recommended_guardrail)
VALUES ('30000000-0000-0000-0000-000000001042', 14, 6, 3, ARRAY ['payments','fraud'],
        'Time-box to 24h and block export permissions.'),
       ('30000000-0000-0000-0000-000000001041', 9, 4, 2, ARRAY ['attribution'],
        'Restrict creation to prefixed schemas only.'),
       ('30000000-0000-0000-0000-000000001038', 21, 0, 5, ARRAY ['ml','user-profile'],
        'Require cohort filter and sampled read path.'),
       ('30000000-0000-0000-0000-000000001036', 7, 2, 4, ARRAY ['ops'],
        'Mirror writes to audit log and enforce row tags.');

INSERT INTO time_bound_grants (id, principal, team, resource, privilege, started_at, expires_at, reviewer_id,
                               renewal_status, reason)
VALUES ('50000000-0000-0000-0000-000000000001', 'Annie Case', 'Fraud Ops', 'risk.gold_chargebacks', 'MODIFY',
        '2026-05-15T00:00:00Z', '2026-05-17T00:00:00Z', 'Data Platform', 'expiring',
        'Chargeback investigation burst window.'),
       ('50000000-0000-0000-0000-000000000002', 'Nora Patel', 'ML Platform', 'feature_store.user_embeddings', 'SELECT',
        '2026-05-10T00:00:00Z', '2026-05-18T00:00:00Z', 'Security', 'healthy',
        'Model retraining run with approved cohort filter.'),
       ('50000000-0000-0000-0000-000000000003', 'Bao Ho', 'Operations', 'ops.runbooks', 'MODIFY',
        '2026-05-09T00:00:00Z', '2026-05-16T00:00:00Z', 'Data Steward', 'expired',
        'Support rotation annotation backfill.'),
       ('50000000-0000-0000-0000-000000000004', 'Linh Vu', 'Executive Analytics', 'board_metrics', 'CREATE_SCHEMA',
        '2026-05-12T00:00:00Z', '2026-05-22T00:00:00Z', 'Data Platform', 'healthy', 'Q2 operating review workspace.');
