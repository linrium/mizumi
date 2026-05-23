mod adapters;
mod application;
mod domain;
mod infrastructure;

use std::fs;
use std::sync::Arc;

use rdkafka::{ClientConfig, producer::FutureProducer};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use adapters::inbound::http::create_router;
use adapters::outbound::http::uc::UnityCatalogHttpProxy;
use application::{
    chat_thread_service::ChatThreadService, dagster_service::DagsterService,
    expiry_worker::ExpiryWorker, k8s_service::K8sQueryService, lineage_service::LineageService,
    llm_service::LlmService, permission_service::PermissionService,
    streaming_service::StreamingJobService, team_service::TeamService,
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

    let llm_service = LlmService::new(&config.openai);
    if llm_service.is_none() {
        tracing::warn!("OpenAI API key not configured; LLM blast-radius analysis is disabled");
    }
    let state = Arc::new(AppState {
        chat_thread_service: Arc::new(ChatThreadService::new(db.clone())),
        dagster_service: Arc::new(DagsterService),
        k8s_service: Arc::new(K8sQueryService::new(config.duckdb_server.base_url.clone())),
        lineage_service: Arc::new(LineageService::new(
            db.clone(),
            config.unity_catalog.base_url.clone(),
            uc_admin_token.clone(),
            config.dagster.base_url.clone(),
        )),
        permission_service: Arc::new(PermissionService::new(
            db.clone(),
            UnityCatalogProxyService::new(UnityCatalogHttpProxy::new(
                config.unity_catalog.base_url.clone(),
                uc_admin_token.clone(),
            )),
            llm_service,
        )),
        streaming_service: Arc::new(StreamingJobService::new(db.clone())),
        team_service: Arc::new(TeamService::new(db.clone())),
        test_event_service: Arc::new(TestEventService::new(kafka_producer)),
        uc_service: Arc::new(UnityCatalogProxyService::new(UnityCatalogHttpProxy::new(
            config.unity_catalog.base_url.clone(),
            uc_admin_token.clone(),
        ))),
        user_service: Arc::new(UserService::new(db.clone())),
        keycloak_auth: Arc::new(KeycloakAuth::new(
            &config.keycloak.url,
            &config.keycloak.realm,
            config.keycloak.allowed_issuers(),
            config.keycloak.audiences.clone(),
        )),
        bypass_token: config.bypass_token.clone(),
    });

    let app = create_router(state);

    // Start the background expiry worker — runs for the lifetime of the process.
    let expiry_uc = UnityCatalogProxyService::new(UnityCatalogHttpProxy::new(
        config.unity_catalog.base_url.clone(),
        uc_admin_token.clone(),
    ));
    ExpiryWorker::new(db.clone(), expiry_uc).start();

    tracing::info!("listening on {}", config.bind_addr);
    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
