use crate::{
    domain::ports::inbound::*,
    domain::ports::outbound::AuthorizerPort,
    infrastructure::{auth::JwtValidator, token_manager::TokenManager},
};
use std::sync::Arc;

pub struct AppState {
    pub catalog_service: Arc<dyn CatalogUseCase>,
    pub schema_service: Arc<dyn SchemaUseCase>,
    pub table_service: Arc<dyn TableUseCase>,
    pub volume_service: Arc<dyn VolumeUseCase>,
    pub function_service: Arc<dyn FunctionUseCase>,
    pub model_service: Arc<dyn ModelUseCase>,
    pub metastore_service: Arc<dyn MetastoreUseCase>,
    pub permission_service: Arc<dyn PermissionUseCase>,
    pub user_service: Arc<dyn UserUseCase>,
    pub authorizer: Arc<dyn AuthorizerPort>,
    /// Always present — manages internal RSA key and writes token.txt.
    pub token_manager: Arc<TokenManager>,
    /// Present when `server.authorization = "enable"` (external OAuth2/OIDC).
    pub jwt_validator: Option<Arc<JwtValidator>>,
    /// OAuth2 settings forwarded to the auth handlers.
    pub oauth2: Option<OAuth2Config>,
}

/// Subset of ServerConfig needed by the auth handlers.
#[derive(Debug, Clone)]
pub struct OAuth2Config {
    pub authorization_url: String,
    pub token_url: String,
    pub client_id: String,
    pub client_secret: String,
    /// Full public URL of this server, used to build the redirect_uri.
    pub redirect_uri: String,
}
