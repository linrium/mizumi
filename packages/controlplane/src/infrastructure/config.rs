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
pub struct DataContractCliConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_data_contract_cli_image")]
    pub image: String,
    #[serde(default = "default_data_contract_cli_namespace")]
    pub namespace: String,
    #[serde(default = "default_data_contract_cli_timeout_seconds")]
    pub timeout_seconds: u64,
}

#[derive(Clone, Deserialize)]
pub struct TelemetryConfig {
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Clone, Deserialize)]
pub struct ChronicleConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_chronicle_base_url")]
    pub base_url: String,
    #[serde(default = "default_chronicle_source")]
    pub source: String,
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
    pub data_contract_cli: DataContractCliConfig,
    #[serde(default)]
    pub openai: OpenAiConfig,
    #[serde(default)]
    pub telemetry: TelemetryConfig,
    #[serde(default)]
    pub chronicle: ChronicleConfig,
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

fn default_data_contract_cli_image() -> String {
    "datacontract/cli:latest".to_string()
}

fn default_data_contract_cli_namespace() -> String {
    "spark".to_string()
}

fn default_data_contract_cli_timeout_seconds() -> u64 {
    120
}

fn default_openai_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_chronicle_base_url() -> String {
    "http://localhost:3008".to_string()
}

fn default_chronicle_source() -> String {
    "controlplane".to_string()
}

impl Default for DuckdbServerConfig {
    fn default() -> Self {
        Self {
            uri: default_duckdb_server_uri(),
        }
    }
}

impl Default for DataContractCliConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            image: default_data_contract_cli_image(),
            namespace: default_data_contract_cli_namespace(),
            timeout_seconds: default_data_contract_cli_timeout_seconds(),
        }
    }
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self { enabled: false }
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

impl Default for ChronicleConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            base_url: default_chronicle_base_url(),
            source: default_chronicle_source(),
        }
    }
}
