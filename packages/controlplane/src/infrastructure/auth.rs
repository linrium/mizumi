use jsonwebtoken::{
    Algorithm, DecodingKey, Validation, decode, decode_header,
    jwk::{AlgorithmParameters, JwkSet},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
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
    Internal(String),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::MissingToken => write!(f, "missing bearer token"),
            AuthError::InvalidToken => write!(f, "invalid token"),
            AuthError::Internal(e) => write!(f, "auth internal error: {e}"),
        }
    }
}

#[derive(Deserialize)]
struct OidcDiscovery {
    jwks_uri: String,
}

pub struct KeycloakAuth {
    http: reqwest::Client,
    pub issuer: String,
    pub audiences: Vec<String>,
    jwks_uri: Arc<RwLock<Option<String>>>,
    jwks_cache: Arc<RwLock<Option<JwkSet>>>,
}

impl KeycloakAuth {
    pub fn new(keycloak_url: &str, realm: &str, audiences: Vec<String>) -> Self {
        let issuer = format!(
            "{}/realms/{}",
            keycloak_url.trim_end_matches('/'),
            realm
        );
        Self {
            http: reqwest::Client::new(),
            issuer,
            audiences,
            jwks_uri: Arc::new(RwLock::new(None)),
            jwks_cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn resolve_jwks_uri(&self) -> Result<String, AuthError> {
        if let Some(uri) = self.jwks_uri.read().await.as_ref() {
            return Ok(uri.clone());
        }
        let discovery_url = format!(
            "{}/.well-known/openid-configuration",
            self.issuer.trim_end_matches('/')
        );
        tracing::debug!("fetching OIDC discovery: {}", discovery_url);
        let res = self
            .http
            .get(&discovery_url)
            .send()
            .await
            .map_err(|e| AuthError::Internal(format!("OIDC discovery request failed: {e}")))?;

        let status = res.status();
        let body = res
            .text()
            .await
            .map_err(|e| AuthError::Internal(format!("OIDC discovery read failed: {e}")))?;

        if !status.is_success() {
            return Err(AuthError::Internal(format!(
                "OIDC discovery returned {status}: {body}"
            )));
        }

        let doc: OidcDiscovery = serde_json::from_str(&body)
            .map_err(|e| AuthError::Internal(format!("OIDC discovery parse failed: {e} — body: {body}")))?;

        let uri = doc.jwks_uri.clone();
        *self.jwks_uri.write().await = Some(uri.clone());
        Ok(uri)
    }

    async fn fetch_jwks(&self) -> Result<JwkSet, AuthError> {
        let uri = self.resolve_jwks_uri().await?;
        self.http
            .get(&uri)
            .send()
            .await
            .map_err(|e| AuthError::Internal(format!("JWKS fetch failed: {e}")))?
            .json::<JwkSet>()
            .await
            .map_err(|e| AuthError::Internal(format!("JWKS parse failed: {e}")))
    }

    async fn get_jwks(&self) -> Result<JwkSet, AuthError> {
        if let Some(cached) = self.jwks_cache.read().await.as_ref() {
            return Ok(cached.clone());
        }
        let fresh = self.fetch_jwks().await?;
        *self.jwks_cache.write().await = Some(fresh.clone());
        Ok(fresh)
    }

    async fn refresh_jwks(&self) -> Result<JwkSet, AuthError> {
        *self.jwks_cache.write().await = None;
        let fresh = self.fetch_jwks().await?;
        *self.jwks_cache.write().await = Some(fresh.clone());
        Ok(fresh)
    }

    pub async fn validate(&self, token: &str) -> Result<KeycloakClaims, AuthError> {
        let header = decode_header(token).map_err(|_| AuthError::InvalidToken)?;
        let kid = header.kid.as_deref();

        match self.try_validate(token, kid, false).await {
            Ok(c) => Ok(c),
            Err(_) => self.try_validate(token, kid, true).await,
        }
    }

    async fn try_validate(
        &self,
        token: &str,
        kid: Option<&str>,
        force_refresh: bool,
    ) -> Result<KeycloakClaims, AuthError> {
        let jwks = if force_refresh {
            self.refresh_jwks().await?
        } else {
            self.get_jwks().await?
        };

        let jwk = match kid {
            Some(id) => jwks.find(id),
            None => jwks.keys.first(),
        }
        .ok_or(AuthError::InvalidToken)?;

        let decoding_key = match &jwk.algorithm {
            AlgorithmParameters::RSA(rsa) => DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
                .map_err(|e| AuthError::Internal(format!("JWK RSA key error: {e}")))?,
            AlgorithmParameters::EllipticCurve(ec) => {
                DecodingKey::from_ec_components(&ec.x, &ec.y)
                    .map_err(|e| AuthError::Internal(format!("JWK EC key error: {e}")))?
            }
            _ => return Err(AuthError::Internal("unsupported JWK algorithm".into())),
        };

        let alg = jwk
            .common
            .key_algorithm
            .and_then(|a| a.to_string().parse::<Algorithm>().ok())
            .unwrap_or(Algorithm::RS256);

        tracing::debug!("jwk issuer: {}", self.issuer);
        tracing::debug!("jwk audiences: {:?}", self.audiences);

        let mut validation = Validation::new(alg);
        validation.set_issuer(&[&self.issuer]);
        if self.audiences.is_empty() {
            validation.validate_aud = false;
        } else {
            validation.set_audience(&self.audiences);
        }

        decode::<KeycloakClaims>(token, &decoding_key, &validation)
            .map(|d| d.claims)
            .map_err(|e| {
                tracing::debug!("JWT validation failed: {e}");
                AuthError::InvalidToken
            })
    }
}
