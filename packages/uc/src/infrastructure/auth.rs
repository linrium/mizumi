use crate::domain::error::DomainError;
use jsonwebtoken::{
    decode, decode_header,
    jwk::{AlgorithmParameters, JwkSet},
    Algorithm, DecodingKey, Validation,
};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Validated claims extracted from a JWT bearer token.
#[derive(Debug, Clone, Deserialize)]
pub struct AuthClaims {
    pub sub: String,
    pub iss: String,
    /// Audience can be a single string or an array — deserialize as JSON Value.
    pub aud: serde_json::Value,
    pub exp: u64,
    pub email: Option<String>,
    pub preferred_username: Option<String>,
}

impl AuthClaims {
    pub fn principal(&self) -> &str {
        self.email
            .as_deref()
            .or(self.preferred_username.as_deref())
            .unwrap_or(&self.sub)
    }
}

/// Minimal OIDC discovery document.
#[derive(Deserialize)]
struct OidcDiscovery {
    jwks_uri: String,
}

/// Validates JWT bearer tokens against the configured OIDC issuer.
///
/// JWKS keys are fetched once and cached; the cache is invalidated and
/// refreshed whenever a `kid` is not found (handles key rotation).
pub struct JwtValidator {
    http: reqwest::Client,
    pub discovery_issuer: String,
    pub allowed_issuers: Vec<String>,
    pub audiences: Vec<String>,
    jwks_uri: Arc<RwLock<Option<String>>>,
    jwks_cache: Arc<RwLock<Option<JwkSet>>>,
}

impl JwtValidator {
    pub fn new(discovery_issuer: String, allowed_issuers: Vec<String>, audiences: Vec<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            discovery_issuer,
            allowed_issuers,
            audiences,
            jwks_uri: Arc::new(RwLock::new(None)),
            jwks_cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn resolve_jwks_uri(&self) -> Result<String, DomainError> {
        {
            if let Some(uri) = self.jwks_uri.read().await.as_ref() {
                return Ok(uri.clone());
            }
        }
        let discovery_url = format!(
            "{}/.well-known/openid-configuration",
            self.discovery_issuer.trim_end_matches('/')
        );
        let doc: OidcDiscovery = self
            .http
            .get(&discovery_url)
            .send()
            .await
            .map_err(|e| DomainError::Internal(format!("OIDC discovery failed: {e}")))?
            .json()
            .await
            .map_err(|e| DomainError::Internal(format!("OIDC discovery parse failed: {e}")))?;

        let uri = doc.jwks_uri.clone();
        *self.jwks_uri.write().await = Some(uri.clone());
        Ok(uri)
    }

    async fn fetch_jwks(&self) -> Result<JwkSet, DomainError> {
        let uri = self.resolve_jwks_uri().await?;
        self.http
            .get(&uri)
            .send()
            .await
            .map_err(|e| DomainError::Internal(format!("JWKS fetch failed: {e}")))?
            .json::<JwkSet>()
            .await
            .map_err(|e| DomainError::Internal(format!("JWKS parse failed: {e}")))
    }

    async fn get_jwks(&self) -> Result<JwkSet, DomainError> {
        if let Some(cached) = self.jwks_cache.read().await.as_ref() {
            return Ok(cached.clone());
        }
        let fresh = self.fetch_jwks().await?;
        *self.jwks_cache.write().await = Some(fresh.clone());
        Ok(fresh)
    }

    /// Invalidate the cached JWKS and re-fetch (used on unknown `kid`).
    async fn refresh_jwks(&self) -> Result<JwkSet, DomainError> {
        *self.jwks_cache.write().await = None;
        let fresh = self.fetch_jwks().await?;
        *self.jwks_cache.write().await = Some(fresh.clone());
        Ok(fresh)
    }

    /// Validate a raw JWT string. Returns the decoded claims on success.
    pub async fn validate(&self, token: &str) -> Result<AuthClaims, DomainError> {
        let header = decode_header(token)
            .map_err(|_| DomainError::InvalidArgument("Invalid token header".into()))?;

        let kid = header.kid.as_deref();

        let claims = match self.try_validate_with_jwks(token, kid, false).await {
            Ok(c) => c,
            Err(_) => self.try_validate_with_jwks(token, kid, true).await?,
        };

        Ok(claims)
    }

    async fn try_validate_with_jwks(
        &self,
        token: &str,
        kid: Option<&str>,
        force_refresh: bool,
    ) -> Result<AuthClaims, DomainError> {
        let jwks = if force_refresh {
            self.refresh_jwks().await?
        } else {
            self.get_jwks().await?
        };

        let jwk = match kid {
            Some(id) => jwks.find(id),
            None => jwks.keys.first(),
        }
        .ok_or_else(|| DomainError::InvalidArgument("No matching JWK found for token".into()))?;

        let decoding_key = match &jwk.algorithm {
            AlgorithmParameters::RSA(rsa) => DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
                .map_err(|e| DomainError::Internal(format!("JWK key error: {e}")))?,
            AlgorithmParameters::EllipticCurve(ec) => DecodingKey::from_ec_components(&ec.x, &ec.y)
                .map_err(|e| DomainError::Internal(format!("JWK EC key error: {e}")))?,
            _ => {
                return Err(DomainError::InvalidArgument(
                    "Unsupported JWK algorithm".into(),
                ))
            }
        };

        let alg = jwk
            .common
            .key_algorithm
            .and_then(|a| a.to_string().parse::<Algorithm>().ok())
            .unwrap_or(Algorithm::RS256);

        let mut validation = Validation::new(alg);
        let issuers = self
            .allowed_issuers
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        validation.set_issuer(&issuers);
        if !self.audiences.is_empty() {
            validation.set_audience(&self.audiences);
        }

        let data = decode::<AuthClaims>(token, &decoding_key, &validation)
            .map_err(|e| DomainError::InvalidArgument(format!("Token validation failed: {e}")))?;

        Ok(data.claims)
    }
}
