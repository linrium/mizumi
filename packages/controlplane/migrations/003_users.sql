CREATE TABLE users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT        NOT NULL,
    username     TEXT        NOT NULL,
    full_name    TEXT        NOT NULL DEFAULT '',
    roles        TEXT[]      NOT NULL DEFAULT '{}',
    user_type    TEXT        NOT NULL DEFAULT 'USER' CHECK (user_type IN ('GROUP', 'USER')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_idx ON users (email);

INSERT INTO users (id, email, username, full_name, user_type) VALUES
    ('20000000-0000-0000-0000-000000000001', 'annie.case@example.com',   'annie.case',   'Annie Case',   'USER'),
    ('20000000-0000-0000-0000-000000000002', 'mai.nguyen@example.com',   'mai.nguyen',   'Mai Nguyen',   'USER'),
    ('20000000-0000-0000-0000-000000000003', 'kenji.mori@example.com',   'kenji.mori',   'Kenji Mori',   'USER'),
    ('20000000-0000-0000-0000-000000000004', 'nora.patel@example.com',   'nora.patel',   'Nora Patel',   'USER'),
    ('20000000-0000-0000-0000-000000000005', 'bao.ho@example.com',       'bao.ho',       'Bao Ho',       'USER'),
    ('20000000-0000-0000-0000-000000000006', 'linh.vu@example.com',      'linh.vu',      'Linh Vu',      'USER'),
    ('20000000-0000-0000-0000-000000000007', 'haruto.sato@example.com',  'haruto.sato',  'Haruto Sato',  'USER');
