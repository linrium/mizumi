mod adapters;
mod application;
mod domain;
mod infrastructure;

use std::fs;
use std::sync::Arc;

use rdkafka::{ClientConfig, producer::FutureProducer};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use adapters::inbound::http::create_router;
use adapters::outbound::{http::uc::UnityCatalogHttpProxy, kubernetes::duckdb::SessionStore};
use application::{
    dagster_service::DagsterService, k8s_service::K8sQueryService,
    permission_service::PermissionService, streaming_service::StreamingJobService,
    test_event_service::TestEventService, uc_service::UnityCatalogProxyService,
    user_service::UserService,
};
use infrastructure::{auth::KeycloakAuth, config::Config, db, server::AppState};

fn resolve_uc_admin_token(config: &Config) -> Result<String, Box<dyn std::error::Error>> {
    if let Some(path) = &config.unity_catalog.admin_token_file {
        let token = fs::read_to_string(path)?.trim().to_string();
        if token.is_empty() {
            return Err("unity_catalog.admin_token_file points to an empty file".into());
        }
        return Ok(token);
    }

    let token = config.unity_catalog.admin_token.trim().to_string();
    if token.is_empty() {
        return Err(
            "unity_catalog.admin_token or unity_catalog.admin_token_file must be configured".into(),
        );
    }

    Ok(token)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::load().expect("failed to load config");
    let uc_admin_token = resolve_uc_admin_token(&config)?;
    let db = db::create_pool(&config.database.url)
        .await
        .expect("failed to connect to postgres");

    let kafka_producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka.bootstrap_servers)
        .set("message.timeout.ms", "10000")
        .create()
        .expect("failed to create kafka producer");

    db::run_migrations(&db)
        .await
        .expect("failed to run migrations");

    let session_store = SessionStore::new();
    let state = Arc::new(AppState {
        dagster_service: Arc::new(DagsterService),
        k8s_service: Arc::new(K8sQueryService::new(session_store)),
        permission_service: Arc::new(PermissionService::new(
            db.clone(),
            UnityCatalogProxyService::new(UnityCatalogHttpProxy::new(
                config.unity_catalog.base_url.clone(),
                uc_admin_token.clone(),
            )),
        )),
        streaming_service: Arc::new(StreamingJobService::new(db.clone())),
        test_event_service: Arc::new(TestEventService::new(kafka_producer)),
        uc_service: Arc::new(UnityCatalogProxyService::new(UnityCatalogHttpProxy::new(
            config.unity_catalog.base_url.clone(),
            uc_admin_token,
        ))),
        user_service: Arc::new(UserService::new(db.clone())),
        keycloak_auth: Arc::new(KeycloakAuth::new(
            &config.keycloak.url,
            &config.keycloak.realm,
            config.keycloak.audiences.clone(),
        )),
    });

    let app = create_router(state);
    tracing::info!("listening on {}", config.bind_addr);
    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
