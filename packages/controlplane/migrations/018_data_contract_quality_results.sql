CREATE TABLE data_contract_quality_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semantic_definition_id UUID NOT NULL REFERENCES semantic_definitions(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    warnings JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (namespace <> ''),
    CHECK (name <> ''),
    CHECK (status IN ('passed', 'failed', 'error', 'unknown'))
);

CREATE INDEX data_contract_quality_runs_definition_idx
    ON data_contract_quality_runs (semantic_definition_id, created_at DESC);

CREATE INDEX data_contract_quality_runs_lookup_idx
    ON data_contract_quality_runs (namespace, name, version, created_at DESC);

CREATE TABLE data_contract_quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES data_contract_quality_runs(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    check_id TEXT NOT NULL,
    description TEXT NOT NULL,
    field TEXT,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    failed_rows BIGINT,
    total_rows BIGINT,
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, ordinal),
    CHECK (check_id <> ''),
    CHECK (description <> ''),
    CHECK (status IN ('passed', 'failed', 'error')),
    CHECK (query <> '')
);

CREATE INDEX data_contract_quality_checks_run_idx
    ON data_contract_quality_checks (run_id, ordinal ASC);
