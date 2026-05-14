#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub kafka_bootstrap_servers: String,
    pub bind_addr: String,
    pub uc_base_url: String,
}

impl Config {
    pub fn load() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").unwrap_or(
                "postgres://controlplane:controlplane_password@localhost:5433/controlplane"
                    .to_string(),
            ),
            kafka_bootstrap_servers: std::env::var("KAFKA_BOOTSTRAP_SERVERS")
                .unwrap_or("127.0.0.1:19092".to_string()),
            bind_addr: std::env::var("BIND_ADDR").unwrap_or("0.0.0.0:6000".to_string()),
            uc_base_url: std::env::var("UC_BASE_URL").unwrap_or_else(|_| {
                "http://localhost:8082/api/2.1/unity-catalog".to_string()
            }),
        }
    }
}
