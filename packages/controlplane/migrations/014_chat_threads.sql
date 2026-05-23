CREATE TABLE chat_threads
(
    id                   UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    user_id              UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title                TEXT        NOT NULL DEFAULT 'New chat',
    last_message_preview TEXT        NOT NULL DEFAULT '',
    message_count        INTEGER     NOT NULL DEFAULT 0,
    messages             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    last_message_at      TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX chat_threads_user_last_message_idx
    ON chat_threads (user_id, last_message_at DESC, updated_at DESC);
