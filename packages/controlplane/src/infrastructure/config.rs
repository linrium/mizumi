use config::{ConfigError, Environment, File};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub kafka_bootstrap_servers: String,
    pub bind_addr: String,
    pub uc_base_url: String,
    pub keycloak_url: String,
    pub keycloak_realm: String,
}

impl Config {
    pub fn load() -> Result<Self, ConfigError> {
        config::Config::builder()
            .add_source(File::with_name("config").required(false))
            .add_source(Environment::default())
            .build()?
            .try_deserialize()
    }
}
