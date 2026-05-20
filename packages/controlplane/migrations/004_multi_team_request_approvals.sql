CREATE TABLE policy_template_approval_steps
(
    id                 UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    policy_template_id UUID        NOT NULL REFERENCES policy_templates (id) ON DELETE CASCADE,
    stage_order        INTEGER     NOT NULL CHECK (stage_order > 0),
    approver_team_id   UUID        NOT NULL REFERENCES teams (id),
    approver_label     TEXT        NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (policy_template_id, stage_order, approver_team_id)
);

CREATE INDEX policy_template_approval_steps_template_idx
    ON policy_template_approval_steps (policy_template_id, stage_order);

CREATE TABLE permission_request_approval_steps
(
    id               UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    request_id       UUID        NOT NULL REFERENCES permission_requests (id) ON DELETE CASCADE,
    stage_order      INTEGER     NOT NULL CHECK (stage_order > 0),
    approver_team_id UUID        NOT NULL REFERENCES teams (id),
    approver_label   TEXT        NOT NULL DEFAULT '',
    status           TEXT        NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'pending', 'approved', 'needs-info', 'cancelled')),
    acted_at         TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id, stage_order, approver_team_id)
);

CREATE INDEX permission_request_approval_steps_request_idx
    ON permission_request_approval_steps (request_id, stage_order, status);

INSERT INTO policy_template_approval_steps (policy_template_id, stage_order, approver_team_id, approver_label)
VALUES ('40000000-0000-0000-0000-000000000002', 1, '10000000-0000-0000-0000-000000000004', 'Data steward review'),
       ('40000000-0000-0000-0000-000000000002', 2, '10000000-0000-0000-0000-000000000005', 'Security sign-off'),
       ('40000000-0000-0000-0000-000000000003', 1, '10000000-0000-0000-0000-000000000004', 'Data steward review'),
       ('40000000-0000-0000-0000-000000000003', 2, '10000000-0000-0000-0000-000000000002', 'VietJet analytics confirmation'),
       ('40000000-0000-0000-0000-000000000004', 1, '10000000-0000-0000-0000-000000000004', 'Data steward review'),
       ('40000000-0000-0000-0000-000000000004', 2, '10000000-0000-0000-0000-000000000005', 'Security sign-off');

WITH request_steps AS (
    SELECT
        pr.id AS request_id,
        pts.stage_order,
        pts.approver_team_id,
        pts.approver_label,
        CASE
            WHEN pr.status = 'approved' THEN 'approved'
            WHEN pr.status = 'cancelled' THEN 'cancelled'
            WHEN pr.status = 'needs-info' AND pts.stage_order = first_stage.first_stage_order THEN 'needs-info'
            WHEN pts.stage_order = first_stage.first_stage_order THEN
                CASE
                    WHEN pr.status IN ('ready', 'pending') THEN 'pending'
                    ELSE 'waiting'
                END
            ELSE
                CASE
                    WHEN pr.status = 'approved' THEN 'approved'
                    WHEN pr.status = 'cancelled' THEN 'cancelled'
                    ELSE 'waiting'
                END
        END AS step_status,
        CASE
            WHEN pr.status IN ('approved', 'needs-info', 'cancelled') THEN pr.updated_at
            ELSE NULL
        END AS acted_at
    FROM permission_requests pr
    JOIN (
        SELECT
            policy_template_id,
            MIN(stage_order) AS first_stage_order
        FROM policy_template_approval_steps
        GROUP BY policy_template_id
    ) AS first_stage ON first_stage.policy_template_id = pr.policy_template_id
    JOIN policy_template_approval_steps pts ON pts.policy_template_id = pr.policy_template_id
), manual_request_steps AS (
    SELECT
        pr.id AS request_id,
        1 AS stage_order,
        pr.reviewer_id AS approver_team_id,
        'Manual review' AS approver_label,
        CASE
            WHEN pr.status = 'approved' THEN 'approved'
            WHEN pr.status = 'cancelled' THEN 'cancelled'
            WHEN pr.status = 'needs-info' THEN 'needs-info'
            WHEN pr.status IN ('ready', 'pending') THEN 'pending'
            ELSE 'waiting'
        END AS step_status,
        CASE
            WHEN pr.status IN ('approved', 'needs-info', 'cancelled') THEN pr.updated_at
            ELSE NULL
        END AS acted_at
    FROM permission_requests pr
    WHERE pr.policy_template_id IS NULL
)
INSERT INTO permission_request_approval_steps (
    request_id,
    stage_order,
    approver_team_id,
    approver_label,
    status,
    acted_at
)
SELECT request_id, stage_order, approver_team_id, approver_label, step_status, acted_at
FROM request_steps
UNION ALL
SELECT request_id, stage_order, approver_team_id, approver_label, step_status, acted_at
FROM manual_request_steps;
