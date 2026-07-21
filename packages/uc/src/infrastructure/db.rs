use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    PgPool,
};
use std::sync::Arc;
use tracing::{Instrument, Span};

pub async fn create_pool(database_url: &str, max_connections: u32) -> anyhow::Result<Arc<PgPool>> {
    let attrs = PostgresTelemetryAttrs::from_database_url(database_url)?;
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .after_connect({
            let attrs = attrs.clone();
            move |_conn, _meta| {
                let attrs = attrs.clone();
                Box::pin(async move {
                    let _entered = postgres_client_span(&attrs, "connect").entered();
                    Ok(())
                })
            }
        })
        .before_acquire({
            let attrs = attrs.clone();
            move |_conn, meta| {
                let attrs = attrs.clone();
                Box::pin(async move {
                    let _entered = postgres_client_span(&attrs, "acquire").entered();
                    tracing::debug!(
                        db.connection.age_ms = meta.age.as_millis() as i64,
                        db.connection.idle_ms = meta.idle_for.as_millis() as i64,
                        "postgres connection acquired"
                    );
                    Ok(true)
                })
            }
        })
        .connect(database_url)
        .instrument(postgres_client_span(&attrs, "pool.connect"))
        .await?;
    Ok(Arc::new(pool))
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[derive(Clone)]
struct PostgresTelemetryAttrs {
    host: String,
    port: u16,
    database: String,
    peer_service: String,
}

impl PostgresTelemetryAttrs {
    fn from_database_url(database_url: &str) -> Result<Self, sqlx::Error> {
        let options = database_url.parse::<PgConnectOptions>()?;
        let host = options.get_host().to_string();
        let port = options.get_port();
        let database = options
            .get_database()
            .unwrap_or_else(|| options.get_username())
            .to_string();

        Ok(Self {
            peer_service: host
                .split_once('.')
                .map(|(service, _)| service)
                .unwrap_or(&host)
                .to_string(),
            host,
            port,
            database,
        })
    }
}

fn postgres_client_span(attrs: &PostgresTelemetryAttrs, operation: &'static str) -> Span {
    tracing::info_span!(
        "postgres.client",
        otel.name = %format!("POSTGRES {operation}"),
        otel.kind = "client",
        db.operation.name = operation,
        db.system = "postgresql",
        db.system.name = "postgresql",
        db.name = %attrs.database,
        db.namespace = %attrs.database,
        server.address = %attrs.host,
        server.port = attrs.port as i64,
        net.peer.name = %attrs.host,
        net.peer.port = attrs.port as i64,
        peer.service = %attrs.peer_service,
    )
}
