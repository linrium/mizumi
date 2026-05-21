ALTER TABLE blast_radius_previews
    ADD COLUMN llm_risk                TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN llm_recommended_guardrail TEXT NOT NULL DEFAULT '';
