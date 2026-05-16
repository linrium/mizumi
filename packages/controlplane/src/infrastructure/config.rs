use config::{ConfigError, Environment, File};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Clone, Deserialize)]
pub struct KafkaConfig {
    pub bootstrap_servers: String,
}

#[derive(Clone, Deserialize)]
pub struct UnityCatalogConfig {
    pub base_url: String,
    #[serde(default)]
    pub admin_token: String,
    pub admin_token_file: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct KeycloakConfig {
    pub url: String,
    pub realm: String,
    #[serde(default)]
    pub audiences: Vec<String>,
}

#[derive(Clone, Deserialize)]
pub struct Config {
    pub bind_addr: String,
    pub database: DatabaseConfig,
    pub kafka: KafkaConfig,
    pub unity_catalog: UnityCatalogConfig,
    pub keycloak: KeycloakConfig,
}

impl Config {
    pub fn load() -> Result<Self, ConfigError> {
        config::Config::builder()
            .add_source(File::with_name("config").required(false))
            .add_source(Environment::default().separator("__").list_separator(","))
            .build()?
            .try_deserialize()
    }
}
