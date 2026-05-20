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
VALUES ('10000000-0000-0000-0000-000000000002', 'VietJetair Analytics', 'vietjetair'),
       ('10000000-0000-0000-0000-000000000004', 'Sovico Data Steward', 'partnership'),
       ('10000000-0000-0000-0000-000000000005', 'HDBank Platform', 'hdbank');

INSERT INTO policy_templates (id, name, scope, resource, team_ids, privileges, approval_mode, risk, usage_30d, owner_id,
                              last_updated)
VALUES ('40000000-0000-0000-0000-000000000001', 'VietJet partnership gold read', 'schema',
        'vietjetair.vietjetair_partnership_prod_gold',
        ARRAY ['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000004'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'auto', 'low', 18, '10000000-0000-0000-0000-000000000004',
        '2026-05-12T09:00:00Z'),
       ('40000000-0000-0000-0000-000000000002', 'HDBank partnership gold read', 'schema',
        'hdbank.hdbank_partnership_prod_gold',
        ARRAY ['10000000-0000-0000-0000-000000000004'::uuid,'10000000-0000-0000-0000-000000000005'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'review', 'medium', 11, '10000000-0000-0000-0000-000000000004',
        '2026-05-10T05:10:00Z'),
       ('40000000-0000-0000-0000-000000000003', 'Partnership campaign read', 'schema',
        'partnership.co_brand_gold',
        ARRAY ['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000004'::uuid,'10000000-0000-0000-0000-000000000005'::uuid],
        ARRAY ['USE_SCHEMA','SELECT'], 'review', 'medium', 7, '10000000-0000-0000-0000-000000000004',
        '2026-05-11T07:45:00Z'),
       ('40000000-0000-0000-0000-000000000004', 'Partnership campaign writeback', 'table',
        'partnership.co_brand_gold.campaign_summary_v1',
        ARRAY ['10000000-0000-0000-0000-000000000004'::uuid],
        ARRAY ['SELECT','MODIFY'], 'escalate', 'high', 4, '10000000-0000-0000-0000-000000000005',
        '2026-05-14T02:20:00Z');
