CREATE TABLE permission_requests (
    id           TEXT        PRIMARY KEY,
    requester    TEXT        NOT NULL,
    team         TEXT        NOT NULL,
    resource     TEXT        NOT NULL,
    scope        TEXT        NOT NULL,
    privileges   TEXT[]      NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',
    reviewer     TEXT        NOT NULL,
    rationale    TEXT        NOT NULL DEFAULT '',
    risk         TEXT        NOT NULL DEFAULT 'low',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_templates (
    id            TEXT        PRIMARY KEY,
    name          TEXT        NOT NULL,
    scope         TEXT        NOT NULL,
    teams         TEXT[]      NOT NULL DEFAULT '{}',
    privileges    TEXT[]      NOT NULL DEFAULT '{}',
    approval_mode TEXT        NOT NULL DEFAULT 'review',
    risk          TEXT        NOT NULL DEFAULT 'low',
    usage_30d     INTEGER     NOT NULL DEFAULT 0,
    owner         TEXT        NOT NULL,
    last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE blast_radius_previews (
    request_id            TEXT        PRIMARY KEY REFERENCES permission_requests(id) ON DELETE CASCADE,
    downstream_assets     INTEGER     NOT NULL DEFAULT 0,
    dashboards            INTEGER     NOT NULL DEFAULT 0,
    consumers             INTEGER     NOT NULL DEFAULT 0,
    sensitive_domains     TEXT[]      NOT NULL DEFAULT '{}',
    recommended_guardrail TEXT        NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE time_bound_grants (
    id             TEXT        PRIMARY KEY,
    principal      TEXT        NOT NULL,
    team           TEXT        NOT NULL,
    resource       TEXT        NOT NULL,
    privilege      TEXT        NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    reviewer       TEXT        NOT NULL,
    renewal_status TEXT        NOT NULL DEFAULT 'healthy',
    reason         TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permission_requests (id, requester, team, resource, scope, privileges, submitted_at, expires_at, status, reviewer, rationale, risk) VALUES
    ('PR-1042', 'Annie Case',    'Fraud Ops',            'risk.gold_chargebacks',          'table',   ARRAY['SELECT','MODIFY'],               '2026-05-16T01:12:00Z', '2026-05-17T01:12:00Z', 'pending',    'Data Platform', 'Investigating a spike in dispute reversals for the Japan lane.',          'high'),
    ('PR-1041', 'Mai Nguyen',    'Growth Analytics',     'marketing',                      'catalog', ARRAY['USE_CATALOG','CREATE_SCHEMA'],   '2026-05-15T06:30:00Z', '2026-05-21T06:30:00Z', 'ready',      'Governance',    'Standing up a campaign-attribution sandbox for a new partner.',           'medium'),
    ('PR-1039', 'Kenji Mori',    'Finance BI',           'finance.ap_closure',             'schema',  ARRAY['USE_SCHEMA','SELECT'],           '2026-05-14T10:00:00Z', '2026-05-30T10:00:00Z', 'approved',   'Minh Tran',     'Month-end close support for vendor accrual reconciliation.',              'low'),
    ('PR-1038', 'Nora Patel',    'ML Platform',          'feature_store.user_embeddings',  'table',   ARRAY['SELECT'],                       '2026-05-14T02:48:00Z', '2026-05-19T02:48:00Z', 'needs-info', 'Security',      'Model retraining run needs a narrower cohort definition.',                'medium'),
    ('PR-1036', 'Bao Ho',        'Operations',           'ops.runbooks',                   'schema',  ARRAY['USE_SCHEMA','SELECT','MODIFY'],  '2026-05-13T08:15:00Z', '2026-05-18T08:15:00Z', 'pending',    'Data Steward',  'Support rotation needs edit access for incident annotations.',            'high'),
    ('PR-1034', 'Linh Vu',       'Executive Analytics',  'board_metrics',                  'catalog', ARRAY['USE_CATALOG','CREATE_SCHEMA'],   '2026-05-12T09:10:00Z', '2026-05-23T09:10:00Z', 'ready',      'Data Platform', 'Dedicated exec reporting workspace for Q2 operating review.',            'medium'),
    ('PR-1031', 'Haruto Sato',   'Support Intelligence', 'support.ticket_embeddings',      'table',   ARRAY['SELECT'],                       '2026-05-11T23:40:00Z', '2026-05-25T23:40:00Z', 'pending',    'Security',      'Case clustering pilot for deflection opportunities.',                    'low');

INSERT INTO policy_templates (id, name, scope, teams, privileges, approval_mode, risk, usage_30d, owner, last_updated) VALUES
    ('PT-001', 'Analytics read sandbox',  'schema',  ARRAY['Growth Analytics','Finance BI','Executive Analytics'], ARRAY['USE_SCHEMA','SELECT'],         'auto',     'low',    28, 'Governance',   '2026-05-12T09:00:00Z'),
    ('PT-002', 'Operational writeback',   'table',   ARRAY['Operations','Fraud Ops'],                             ARRAY['SELECT','MODIFY'],             'review',   'high',    9, 'Data Steward', '2026-05-09T15:30:00Z'),
    ('PT-003', 'Catalog bootstrap',       'catalog', ARRAY['Growth Analytics','ML Platform'],                     ARRAY['USE_CATALOG','CREATE_SCHEMA'],  'review',   'medium',  6, 'Data Platform','2026-05-10T05:10:00Z'),
    ('PT-004', 'Sensitive feature access','table',   ARRAY['ML Platform'],                                        ARRAY['SELECT'],                       'escalate', 'high',    4, 'Security',     '2026-05-14T02:20:00Z');

INSERT INTO blast_radius_previews (request_id, downstream_assets, dashboards, consumers, sensitive_domains, recommended_guardrail) VALUES
    ('PR-1042', 14, 6, 3, ARRAY['payments','fraud'],        'Time-box to 24h and block export permissions.'),
    ('PR-1041',  9, 4, 2, ARRAY['attribution'],             'Restrict creation to prefixed schemas only.'),
    ('PR-1038', 21, 0, 5, ARRAY['ml','user-profile'],       'Require cohort filter and sampled read path.'),
    ('PR-1036',  7, 2, 4, ARRAY['ops'],                     'Mirror writes to audit log and enforce row tags.');

INSERT INTO time_bound_grants (id, principal, team, resource, privilege, started_at, expires_at, reviewer, renewal_status, reason) VALUES
    ('TG-2204', 'Annie Case', 'Fraud Ops',          'risk.gold_chargebacks',         'MODIFY',        '2026-05-15T00:00:00Z', '2026-05-17T00:00:00Z', 'Data Platform', 'expiring', 'Chargeback investigation burst window.'),
    ('TG-2201', 'Nora Patel', 'ML Platform',        'feature_store.user_embeddings', 'SELECT',        '2026-05-10T00:00:00Z', '2026-05-18T00:00:00Z', 'Security',      'healthy',  'Model retraining run with approved cohort filter.'),
    ('TG-2198', 'Bao Ho',     'Operations',         'ops.runbooks',                  'MODIFY',        '2026-05-09T00:00:00Z', '2026-05-16T00:00:00Z', 'Data Steward',  'expired',  'Support rotation annotation backfill.'),
    ('TG-2194', 'Linh Vu',    'Executive Analytics','board_metrics',                 'CREATE_SCHEMA', '2026-05-12T00:00:00Z', '2026-05-22T00:00:00Z', 'Data Platform', 'healthy',  'Q2 operating review workspace.');
