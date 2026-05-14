CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS uc_metastore (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);

CREATE TABLE IF NOT EXISTS uc_catalogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    storage_root VARCHAR(2048),
    storage_location VARCHAR(2048)
);

CREATE TABLE IF NOT EXISTS uc_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    catalog_id UUID NOT NULL REFERENCES uc_catalogs(id),
    name VARCHAR(255) NOT NULL,
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    storage_root VARCHAR(2048),
    storage_location VARCHAR(2048),
    UNIQUE(catalog_id, name)
);

CREATE TABLE IF NOT EXISTS uc_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES uc_schemas(id),
    name VARCHAR(255) NOT NULL,
    table_type VARCHAR(64) NOT NULL,
    data_source_format VARCHAR(64),
    storage_location VARCHAR(2048),
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    view_definition TEXT,
    UNIQUE(schema_id, name)
);

CREATE TABLE IF NOT EXISTS uc_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID NOT NULL REFERENCES uc_tables(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    ordinal_position SMALLINT NOT NULL,
    type_text TEXT NOT NULL,
    type_json TEXT,
    type_name VARCHAR(64) NOT NULL,
    type_precision INT,
    type_scale INT,
    type_interval_type VARCHAR(255),
    nullable BOOLEAN NOT NULL DEFAULT true,
    comment TEXT,
    partition_index INT,
    UNIQUE(table_id, ordinal_position, name)
);

CREATE TABLE IF NOT EXISTS uc_volumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES uc_schemas(id),
    name VARCHAR(255) NOT NULL,
    volume_type VARCHAR(64) NOT NULL,
    storage_location VARCHAR(2048),
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    UNIQUE(schema_id, name)
);

CREATE TABLE IF NOT EXISTS uc_functions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES uc_schemas(id),
    name VARCHAR(255) NOT NULL,
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    data_type VARCHAR(64),
    full_data_type VARCHAR(255),
    input_params JSONB,
    return_params JSONB,
    routine_body VARCHAR(64),
    routine_definition TEXT,
    sql_data_access VARCHAR(64),
    is_deterministic BOOLEAN,
    is_null_call BOOLEAN,
    parameter_style VARCHAR(64),
    security_type VARCHAR(64),
    specific_name VARCHAR(255),
    external_language VARCHAR(64),
    UNIQUE(schema_id, name)
);

CREATE TABLE IF NOT EXISTS uc_registered_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES uc_schemas(id),
    name VARCHAR(255) NOT NULL,
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    storage_location VARCHAR(2048),
    max_version_number BIGINT DEFAULT 0,
    UNIQUE(schema_id, name)
);

CREATE TABLE IF NOT EXISTS uc_model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registered_model_id UUID NOT NULL REFERENCES uc_registered_models(id),
    version TIMESTAMP NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING_REGISTRATION',
    source VARCHAR(2048),
    run_id VARCHAR(255),
    comment TEXT,
    owner VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    storage_location VARCHAR(2048),
    UNIQUE(registered_model_id, version)
);

CREATE TABLE IF NOT EXISTS uc_properties (
    entity_id UUID NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    property_key VARCHAR(255) NOT NULL,
    property_value TEXT,
    PRIMARY KEY (entity_id, entity_type, property_key)
);
