use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealmAccess {
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeycloakClaims {
    pub sub: String,
    pub email: Option<String>,
    pub preferred_username: Option<String>,
    pub name: Option<String>,
    pub realm_access: Option<RealmAccess>,
}

impl KeycloakClaims {
    pub fn roles(&self) -> Vec<&str> {
        self.realm_access
            .as_ref()
            .map(|r| r.roles.iter().map(String::as_str).collect())
            .unwrap_or_default()
    }

    #[allow(dead_code)]
    pub fn has_role(&self, role: &str) -> bool {
        self.roles().contains(&role)
    }
}

#[derive(Debug)]
pub enum AuthError {
    #[allow(dead_code)]
    MissingToken,
    InvalidToken,
    UnknownKey,
    JwksFetch(String),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::MissingToken => write!(f, "missing bearer token"),
            AuthError::InvalidToken => write!(f, "invalid token"),
            AuthError::UnknownKey => write!(f, "unknown signing key"),
            AuthError::JwksFetch(e) => write!(f, "failed to fetch JWKS: {}", e),
        }
    }
}

struct JwksCache {
    keys: HashMap<String, Arc<DecodingKey>>,
    fetched_at: Instant,
}

pub struct KeycloakAuth {
    client: reqwest::Client,
    jwks_url: String,
    issuer: String,
    cache: RwLock<Option<JwksCache>>,
}

const CACHE_TTL: Duration = Duration::from_secs(3600);

impl KeycloakAuth {
    pub fn new(keycloak_url: &str, realm: &str) -> Self {
        let base = keycloak_url.trim_end_matches('/');
        Self {
            client: reqwest::Client::new(),
            jwks_url: format!("{}/realms/{}/protocol/openid-connect/certs", base, realm),
            issuer: format!("{}/realms/{}", base, realm),
            cache: RwLock::new(None),
        }
    }

    async fn fetch_keys(&self) -> Result<HashMap<String, Arc<DecodingKey>>, AuthError> {
        let body: serde_json::Value = self
            .client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| AuthError::JwksFetch(e.to_string()))?
            .json()
            .await
            .map_err(|e| AuthError::JwksFetch(e.to_string()))?;

        let keys_arr = body["keys"]
            .as_array()
            .ok_or_else(|| AuthError::JwksFetch("missing keys array".into()))?;

        let mut keys = HashMap::new();
        for key in keys_arr {
            let (Some(kid), Some("RSA"), Some(n), Some(e)) = (
                key["kid"].as_str(),
                key["kty"].as_str(),
                key["n"].as_str(),
                key["e"].as_str(),
            ) else {
                continue;
            };
            match DecodingKey::from_rsa_components(n, e) {
                Ok(dk) => {
                    keys.insert(kid.to_string(), Arc::new(dk));
                }
                Err(err) => {
                    tracing::warn!("skipping JWK kid={}: {}", kid, err);
                }
            }
        }
        Ok(keys)
    }

    async fn get_keys(&self, force_refresh: bool) -> Result<HashMap<String, Arc<DecodingKey>>, AuthError> {
        if !force_refresh {
            let cache = self.cache.read().await;
            if let Some(c) = cache.as_ref() {
                if c.fetched_at.elapsed() < CACHE_TTL {
                    return Ok(c.keys.clone());
                }
            }
        }

        let keys = self.fetch_keys().await?;
        let mut cache = self.cache.write().await;
        *cache = Some(JwksCache {
            keys: keys.clone(),
            fetched_at: Instant::now(),
        });
        Ok(keys)
    }

    pub async fn validate(&self, token: &str) -> Result<KeycloakClaims, AuthError> {
        let header = decode_header(token).map_err(|_| AuthError::InvalidToken)?;
        let kid = header.kid.ok_or(AuthError::InvalidToken)?;

        let key = {
            let keys = self.get_keys(false).await?;
            match keys.get(&kid).cloned() {
                Some(k) => k,
                None => {
                    let keys = self.get_keys(true).await?;
                    keys.get(&kid).cloned().ok_or(AuthError::UnknownKey)?
                }
            }
        };

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&self.issuer]);
        validation.validate_aud = false;

        let data = decode::<KeycloakClaims>(token, &key, &validation)
            .map_err(|e| {
                tracing::debug!("JWT validation failed: {}", e);
                AuthError::InvalidToken
            })?;

        Ok(data.claims)
    }
}
