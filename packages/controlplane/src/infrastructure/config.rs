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
pub struct DagsterConfig {
    #[serde(default = "default_dagster_base_url")]
    pub base_url: String,
}

#[derive(Clone, Deserialize)]
pub struct MlflowConfig {
    #[serde(default = "default_mlflow_base_url")]
    pub base_url: String,
}

#[derive(Clone, Deserialize)]
pub struct KeycloakConfig {
    pub url: String,
    pub realm: String,
    pub issuer: Option<String>,
    #[serde(default)]
    pub issuers: Vec<String>,
    #[serde(default)]
    pub audiences: Vec<String>,
}

impl KeycloakConfig {
    pub fn allowed_issuers(&self) -> Vec<String> {
        if !self.issuers.is_empty() {
            return self.issuers.clone();
        }

        self.issuer.iter().cloned().collect()
    }
}

#[derive(Clone, Deserialize)]
pub struct OpenAiConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_openai_model")]
    pub model: String,
    #[serde(default = "default_openai_base_url")]
    pub base_url: String,
}

#[derive(Clone, Deserialize)]
pub struct DuckdbServerConfig {
    #[serde(default = "default_duckdb_server_uri", alias = "base_url")]
    pub uri: String,
}

#[derive(Clone, Deserialize)]
pub struct Config {
    pub bind_addr: String,
    #[serde(default)]
    pub bypass_token: String,
    pub database: DatabaseConfig,
    #[serde(default)]
    pub dagster: DagsterConfig,
    pub kafka: KafkaConfig,
    pub unity_catalog: UnityCatalogConfig,
    #[serde(default)]
    pub mlflow: MlflowConfig,
    pub keycloak: KeycloakConfig,
    #[serde(default)]
    pub duckdb_server: DuckdbServerConfig,
    #[serde(default)]
    pub openai: OpenAiConfig,
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

fn default_dagster_base_url() -> String {
    "http://localhost:8080".to_string()
}

fn default_mlflow_base_url() -> String {
    "http://localhost:5000".to_string()
}

impl Default for DagsterConfig {
    fn default() -> Self {
        Self {
            base_url: default_dagster_base_url(),
        }
    }
}

impl Default for MlflowConfig {
    fn default() -> Self {
        Self {
            base_url: default_mlflow_base_url(),
        }
    }
}

fn default_openai_model() -> String {
    "gpt-5.4-nano".to_string()
}

fn default_duckdb_server_uri() -> String {
    "quack:localhost:8090".to_string()
}

fn default_openai_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}

impl Default for DuckdbServerConfig {
    fn default() -> Self {
        Self {
            uri: default_duckdb_server_uri(),
        }
    }
}

impl Default for OpenAiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_openai_model(),
            base_url: default_openai_base_url(),
        }
    }
}
