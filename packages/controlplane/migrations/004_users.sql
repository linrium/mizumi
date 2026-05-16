CREATE TABLE users (
    id           TEXT        PRIMARY KEY,
    email        TEXT        NOT NULL,
    username     TEXT        NOT NULL,
    full_name    TEXT        NOT NULL DEFAULT '',
    roles        TEXT[]      NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_idx ON users (email);
