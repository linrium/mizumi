CREATE TABLE semantic_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace TEXT NOT NULL,
    name TEXT NOT NULL,
    object_type TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL,
    owner_principal TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    spec JSONB NOT NULL DEFAULT '{}',
    time_semantics JSONB,
    supersedes_definition_id UUID REFERENCES semantic_definitions(id) ON DELETE SET NULL,
    deprecation_deadline TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (namespace, name, version),
    CHECK (namespace <> ''),
    CHECK (name <> ''),
    CHECK (owner_principal <> ''),
    CHECK (created_by <> ''),
    CHECK (object_type IN ('metric')),
    CHECK (status IN ('draft', 'validated', 'candidate', 'certified', 'active', 'deprecated', 'retired'))
);

CREATE UNIQUE INDEX semantic_definitions_single_active_idx
    ON semantic_definitions (namespace, name)
    WHERE status = 'active';

CREATE INDEX semantic_definitions_lookup_idx
    ON semantic_definitions (namespace, name, status);

CREATE TABLE semantic_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_definition_id UUID NOT NULL REFERENCES semantic_definitions(id) ON DELETE CASCADE,
    target_definition_id UUID NOT NULL REFERENCES semantic_definitions(id) ON DELETE RESTRICT,
    dependency_type TEXT NOT NULL DEFAULT 'semantic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_definition_id, target_definition_id, dependency_type),
    CHECK (source_definition_id <> target_definition_id),
    CHECK (dependency_type <> '')
);

CREATE INDEX semantic_dependencies_source_idx
    ON semantic_dependencies (source_definition_id);

CREATE INDEX semantic_dependencies_target_idx
    ON semantic_dependencies (target_definition_id);

CREATE TABLE semantic_physical_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    semantic_definition_id UUID NOT NULL REFERENCES semantic_definitions(id) ON DELETE CASCADE,
    catalog TEXT NOT NULL,
    schema_name TEXT NOT NULL,
    object_name TEXT NOT NULL,
    object_type TEXT NOT NULL,
    contract_version INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (semantic_definition_id, catalog, schema_name, object_name, object_type),
    CHECK (catalog <> ''),
    CHECK (schema_name <> ''),
    CHECK (object_name <> ''),
    CHECK (object_type <> '')
);

CREATE INDEX semantic_physical_dependencies_definition_idx
    ON semantic_physical_dependencies (semantic_definition_id);

CREATE TABLE semantic_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID NOT NULL REFERENCES semantic_definitions(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    principal TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (principal <> ''),
    CHECK (new_status IN ('draft', 'validated', 'candidate', 'certified', 'active', 'deprecated', 'retired'))
);

CREATE INDEX semantic_lifecycle_events_definition_idx
    ON semantic_lifecycle_events (definition_id, created_at DESC);
