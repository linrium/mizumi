ALTER TABLE semantic_definitions
    DROP CONSTRAINT IF EXISTS semantic_definitions_object_type_check;

ALTER TABLE semantic_definitions
    ADD CONSTRAINT semantic_definitions_object_type_check
    CHECK (object_type IN ('metric', 'data_contract'));

DROP INDEX IF EXISTS semantic_definitions_single_active_idx;

CREATE UNIQUE INDEX semantic_definitions_single_active_idx
    ON semantic_definitions (namespace, name, object_type)
    WHERE status = 'active';
