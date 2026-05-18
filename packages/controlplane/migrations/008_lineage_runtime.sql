CREATE TABLE lineage_runs (
    run_id TEXT PRIMARY KEY,
    node_id UUID REFERENCES lineage_nodes(id) ON DELETE CASCADE,
    source_system TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    properties JSONB NOT NULL DEFAULT '{}',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lineage_node_runtime (
    node_id UUID PRIMARY KEY REFERENCES lineage_nodes(id) ON DELETE CASCADE,
    source_system TEXT NOT NULL,
    latest_run_id TEXT,
    latest_run_status TEXT,
    latest_run_started_at TIMESTAMPTZ,
    latest_run_ended_at TIMESTAMPTZ,
    latest_materialization_at TIMESTAMPTZ,
    latest_materialization_run_id TEXT,
    unstarted_run_ids JSONB NOT NULL DEFAULT '[]',
    in_progress_run_ids JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX lineage_runs_node_idx ON lineage_runs (node_id);
CREATE INDEX lineage_runtime_materialization_idx ON lineage_node_runtime (latest_materialization_at DESC);
