CREATE TABLE IF NOT EXISTS uc_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    external_id VARCHAR,
    state VARCHAR NOT NULL DEFAULT 'ENABLED',
    picture_url VARCHAR,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_uc_users_email ON uc_users (email);
