use serde::Deserialize;

/// Top-level configuration, loaded from `config/server.toml` (and optionally overridden by
/// environment variables prefixed with `UC__`, using `__` as the hierarchy separator).
///
/// Example env override: `UC__SERVER__PORT=9090` overrides `server.port`.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    #[serde(default)]
    pub aws: AwsConfig,
    #[serde(default)]
    pub s3: Vec<S3BucketConfig>,
    #[serde(default)]
    pub adls: Vec<AdlsConfig>,
    #[serde(default)]
    pub gcs: Vec<GcsConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    /// Environment name (e.g. "dev", "prod").
    #[serde(default = "defaults::env")]
    pub env: String,
    /// Bind host.
    #[serde(default = "defaults::host")]
    pub host: String,
    /// Bind port.
    #[serde(default = "defaults::port")]
    pub port: u16,
    /// Publicly reachable base URL of this server, used for OAuth2 redirect callbacks.
    /// Example: `http://localhost:8082` when accessed via `kubectl port-forward`.
    pub public_url: Option<String>,
    /// Set to "enable" to require JWT authorization on all requests.
    #[serde(default = "defaults::authorization")]
    pub authorization: String,
    /// OAuth2 authorization endpoint URL.
    pub authorization_url: Option<String>,
    /// OAuth2 token endpoint URL.
    pub token_url: Option<String>,
    /// OAuth2 client ID.
    pub client_id: Option<String>,
    /// OAuth2 client secret.
    pub client_secret: Option<String>,
    /// Local port used for the OAuth2 redirect callback.
    pub redirect_port: Option<u16>,
    /// Comma-separated list of accepted JWT issuers (exact match).
    #[serde(default)]
    pub allowed_issuers: Vec<String>,
    /// Comma-separated list of accepted JWT audiences.
    #[serde(default)]
    pub audiences: Vec<String>,
    /// Session cookie lifetime in ISO-8601 duration format (e.g. "P5D" for 5 days).
    #[serde(default = "defaults::cookie_timeout")]
    pub cookie_timeout: String,
    #[serde(default)]
    pub managed_table: ManagedTableConfig,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ManagedTableConfig {
    /// Enable experimental managed-table support.
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    /// Full PostgreSQL connection URL.
    #[serde(default = "defaults::database_url")]
    pub url: String,
    /// Maximum number of connections in the pool.
    #[serde(default = "defaults::max_connections")]
    pub max_connections: u32,
}

/// AWS global credential configuration.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct AwsConfig {
    /// IAM role ARN that the Unity Catalog server runs as.
    #[serde(default)]
    pub master_role_arn: Option<String>,
    /// AWS access key ID (falls back to `DefaultCredentialsProvider` when absent).
    #[serde(default)]
    pub access_key: Option<String>,
    /// AWS secret access key.
    #[serde(default)]
    pub secret_key: Option<String>,
    /// AWS region (e.g. "us-east-1").
    #[serde(default)]
    pub region: Option<String>,
}

/// Per-bucket S3 credential configuration.
#[derive(Debug, Clone, Deserialize)]
pub struct S3BucketConfig {
    pub bucket_path: String,
    pub region: Option<String>,
    pub aws_role_arn: Option<String>,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    /// Test-only: if set, these session credentials are used directly without downscoping.
    pub session_token: Option<String>,
    /// Custom S3-compatible endpoint URL (e.g. for RustFS/MinIO).
    /// When set, this is returned to clients so they can connect to the right host.
    pub endpoint: Option<String>,
}

/// Azure Data Lake Storage (ADLS) credential configuration.
#[derive(Debug, Clone, Deserialize)]
pub struct AdlsConfig {
    pub storage_account_name: String,
    pub tenant_id: String,
    pub client_id: String,
    pub client_secret: String,
}

/// GCS credential configuration.
#[derive(Debug, Clone, Deserialize)]
pub struct GcsConfig {
    pub bucket_path: String,
    /// Path to a service-account JSON key file. Falls back to Application Default Credentials.
    pub json_key_file_path: Option<String>,
}

mod defaults {
    pub fn env() -> String {
        "dev".into()
    }
    pub fn host() -> String {
        "0.0.0.0".into()
    }
    pub fn port() -> u16 {
        8080
    }
    pub fn authorization() -> String {
        "disable".into()
    }
    pub fn cookie_timeout() -> String {
        "P5D".into()
    }
    pub fn database_url() -> String {
        "postgres://postgres:password@localhost:5432/unitycatalog".into()
    }
    pub fn max_connections() -> u32 {
        20
    }
}

impl Config {
    /// Load configuration from (in order of increasing priority):
    /// 1. `config/server.toml` — base file (optional)
    /// 2. Environment variables prefixed `UC__` with `__` as the hierarchy separator
    ///    (e.g. `UC__SERVER__PORT=9090` overrides `server.port`)
    pub fn load() -> anyhow::Result<Self> {
        let cfg = config::Config::builder()
            .add_source(
                config::File::with_name("config/server")
                    .format(config::FileFormat::Toml)
                    .required(false),
            )
            .add_source(
                config::Environment::with_prefix("UC")
                    .separator("__")
                    .try_parsing(true),
            )
            .build()?;

        Ok(cfg.try_deserialize()?)
    }
}
