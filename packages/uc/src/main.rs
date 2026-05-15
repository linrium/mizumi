mod adapters;
mod application;
mod domain;
mod infrastructure;

use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use adapters::outbound::postgres::{
    catalog::PgCatalogRepository,
    function::PgFunctionRepository,
    metastore::PgMetastoreRepository,
    model::{PgModelVersionRepository, PgRegisteredModelRepository},
    permissions::{NoOpAuthorizer, PgAuthorizer},
    schema::PgSchemaRepository,
    table::PgTableRepository,
    user::PgUserRepository,
    volume::PgVolumeRepository,
};
use application::{
    catalog_service::CatalogService, function_service::FunctionService,
    metastore_service::MetastoreService, model_service::ModelService,
    permission_service::PermissionService, schema_service::SchemaService,
    table_service::TableService, user_service::UserService, volume_service::VolumeService,
};
use domain::ports::outbound::MetastoreRepository;
use infrastructure::{
    auth::JwtValidator,
    config::Config,
    db,
    server::{AppState, OAuth2Config},
    temporary_credentials::TemporaryCredentialsVendor,
    token_manager::TokenManager,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::load()?;
    tracing::info!("Connecting to database");
    let pool = db::create_pool(&config.database.url, config.database.max_connections).await?;

    tracing::info!("Running migrations");
    db::run_migrations(pool.as_ref()).await?;

    // Build repositories
    let catalog_repo = Arc::new(PgCatalogRepository::new(pool.clone()));
    let schema_repo = Arc::new(PgSchemaRepository::new(pool.clone()));
    let table_repo = Arc::new(PgTableRepository::new(pool.clone()));
    let volume_repo = Arc::new(PgVolumeRepository::new(pool.clone()));
    let function_repo = Arc::new(PgFunctionRepository::new(pool.clone()));
    let model_repo = Arc::new(PgRegisteredModelRepository::new(pool.clone()));
    let version_repo = Arc::new(PgModelVersionRepository::new(pool.clone()));
    let metastore_repo = Arc::new(PgMetastoreRepository::new(pool.clone()));
    let user_repo = Arc::new(PgUserRepository::new(pool.clone()));
    let temporary_credentials_vendor = Arc::new(TemporaryCredentialsVendor::new(config.clone()));

    // Initialize metastore (creates one if it doesn't exist)
    metastore_repo.initialize().await?;

    // Build auth components when authorization is enabled
    let auth_enabled = config.server.authorization.to_lowercase() == "enable";
    let (jwt_validator, oauth2) = if auth_enabled {
        let srv = &config.server;
        let issuer = srv.allowed_issuers.first().cloned().unwrap_or_default();
        let audiences = srv.audiences.clone();

        let validator = Arc::new(JwtValidator::new(issuer, audiences));

        let public_port = config.server.redirect_port.unwrap_or(config.server.port);
        let public_url = config.server.public_url.clone().unwrap_or_else(|| {
            let public_host = match config.server.host.as_str() {
                "0.0.0.0" | "::" => "localhost",
                host => host,
            };
            format!("http://{}:{}", public_host, public_port)
        });
        let redirect_uri = format!("{}/auth/callback", public_url);

        let oauth2 = OAuth2Config {
            authorization_url: srv.authorization_url.clone().unwrap_or_default(),
            token_url: srv.token_url.clone().unwrap_or_default(),
            client_id: srv.client_id.clone().unwrap_or_default(),
            client_secret: srv.client_secret.clone().unwrap_or_default(),
            redirect_uri,
        };
        tracing::info!("Authorization enabled (issuer: {})", validator.issuer);
        (Some(validator), Some(oauth2))
    } else {
        tracing::warn!("Authorization is DISABLED — all API endpoints are public");
        (None, None)
    };

    // Build authorizer
    let authorizer: Arc<dyn domain::ports::outbound::AuthorizerPort> = if auth_enabled {
        Arc::new(PgAuthorizer::new(pool.clone()))
    } else {
        Arc::new(NoOpAuthorizer)
    };

    // Build internal token manager (always active — writes config/token.txt)
    let config_dir = std::path::Path::new("config");
    let token_manager = Arc::new(TokenManager::load_or_generate(config_dir)?);

    // Build services
    let catalog_service: Arc<dyn domain::ports::inbound::CatalogUseCase> =
        Arc::new(CatalogService::new(catalog_repo, authorizer.clone()));
    let schema_service: Arc<dyn domain::ports::inbound::SchemaUseCase> =
        Arc::new(SchemaService::new(schema_repo, authorizer.clone()));
    let table_service: Arc<dyn domain::ports::inbound::TableUseCase> = Arc::new(TableService::new(
        table_repo,
        authorizer.clone(),
        temporary_credentials_vendor.clone(),
    ));
    let volume_service: Arc<dyn domain::ports::inbound::VolumeUseCase> =
        Arc::new(VolumeService::new(volume_repo, authorizer.clone()));
    let function_service: Arc<dyn domain::ports::inbound::FunctionUseCase> =
        Arc::new(FunctionService::new(function_repo, authorizer.clone()));
    let model_service: Arc<dyn domain::ports::inbound::ModelUseCase> = Arc::new(ModelService::new(
        model_repo,
        version_repo,
        authorizer.clone(),
    ));
    let metastore_service: Arc<dyn domain::ports::inbound::MetastoreUseCase> =
        Arc::new(MetastoreService::new(metastore_repo));
    let permission_service: Arc<dyn domain::ports::inbound::PermissionUseCase> =
        Arc::new(PermissionService::new(authorizer.clone()));
    let user_service: Arc<dyn domain::ports::inbound::UserUseCase> =
        Arc::new(UserService::new(user_repo));

    let state = Arc::new(AppState {
        catalog_service,
        schema_service,
        table_service,
        volume_service,
        function_service,
        model_service,
        metastore_service,
        permission_service,
        user_service,
        authorizer,
        token_manager,
        jwt_validator,
        oauth2,
    });

    let router = adapters::inbound::http::create_router(state);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    tracing::info!("Starting server on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, router).await?;

    Ok(())
}
