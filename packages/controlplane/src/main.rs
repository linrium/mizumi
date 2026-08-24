mod adapters;
mod application;
mod domain;
mod infrastructure;

use std::fs;
use std::sync::Arc;

use rdkafka::{ClientConfig, producer::FutureProducer};

use adapters::inbound::http::create_router;
use adapters::outbound::http::mlflow::MlflowHttpProxy;
use adapters::outbound::http::uc::UnityCatalogHttpProxy;
use application::{
    chat_thread_service::ChatThreadService, chronicle_service::ChronicleAuditService,
    dagster_service::DagsterService, data_contract_service::DataContractService,
    expiry_worker::ExpiryWorker, k8s_service::K8sQueryService, lineage_service::LineageService,
    llm_service::LlmService, mlflow_service::MlflowProxyService,
    permission_service::PermissionService, semantic_registry_service::SemanticRegistryService,
    streaming_service::StreamingJobService, team_service::TeamService,
    test_event_service::TestEventService, uc_service::UnityCatalogProxyService,
    user_service::UserService,
};
use infrastructure::{auth::KeycloakAuth, config::Config, db, server::AppState, telemetry};

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
    let config = Config::load().expect("failed to load config");
    let telemetry = telemetry::init(&config.telemetry)?;

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
    let chronicle_service = ChronicleAuditService::new(config.chronicle.clone());
    let state = Arc::new(AppState {
        chat_thread_service: Arc::new(ChatThreadService::new(db.clone())),
        data_contract_service: Arc::new(DataContractService::new(
            db.clone(),
            UnityCatalogProxyService::new(UnityCatalogHttpProxy::new(
                config.unity_catalog.base_url.clone(),
                uc_admin_token.clone(),
            )),
            config.data_contract_cli.clone(),
        )),
        dagster_service: Arc::new(DagsterService),
        mlflow_service: Arc::new(MlflowProxyService::new(MlflowHttpProxy::new(
            config.mlflow.base_url.clone(),
        ))),
        k8s_service: Arc::new(K8sQueryService::new(
            config.duckdb_server.uri.clone(),
            chronicle_service.clone(),
            Some(uc_admin_token.clone()),
        )),
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
            chronicle_service.clone(),
        )),
        semantic_registry_service: Arc::new(SemanticRegistryService::new(db.clone())),
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
    let result = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await;
    telemetry.shutdown();
    result?;
    Ok(())
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::warn!(%error, "failed to listen for shutdown signal");
    }
}
