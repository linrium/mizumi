CREATE TABLE streaming_jobs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    namespace        TEXT        NOT NULL DEFAULT 'spark',
    image            TEXT        NOT NULL,
    main_application_file TEXT   NOT NULL,
    spark_version    TEXT        NOT NULL DEFAULT '4.1.1',
    spark_conf       JSONB       NOT NULL DEFAULT '{}',
    driver_cores     INTEGER     NOT NULL DEFAULT 1,
    driver_memory    TEXT        NOT NULL DEFAULT '512m',
    executor_instances INTEGER   NOT NULL DEFAULT 1,
    executor_cores   INTEGER     NOT NULL DEFAULT 1,
    executor_memory  TEXT        NOT NULL DEFAULT '512m',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX streaming_jobs_name_namespace_idx ON streaming_jobs (name, namespace);
