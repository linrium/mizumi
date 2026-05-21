CREATE TABLE lineage_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_type TEXT NOT NULL,
    platform TEXT NOT NULL,
    namespace TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_type, namespace, name)
);

CREATE TABLE lineage_node_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES lineage_nodes(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (alias)
);

CREATE TABLE lineage_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    src_node_id UUID NOT NULL REFERENCES lineage_nodes(id) ON DELETE CASCADE,
    dst_node_id UUID NOT NULL REFERENCES lineage_nodes(id) ON DELETE CASCADE,
    edge_type TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    properties JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (src_node_id, dst_node_id, edge_type)
);

CREATE TABLE lineage_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    nodes_count INTEGER NOT NULL DEFAULT 0,
    edges_count INTEGER NOT NULL DEFAULT 0,
    aliases_count INTEGER NOT NULL DEFAULT 0,
    message TEXT
);

CREATE INDEX lineage_nodes_lookup_idx ON lineage_nodes (namespace, name);
CREATE INDEX lineage_edges_src_idx ON lineage_edges (src_node_id, edge_type);
CREATE INDEX lineage_edges_dst_idx ON lineage_edges (dst_node_id, edge_type);
