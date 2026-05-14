use std::path::Path;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rsa::{
    pkcs8::{DecodePrivateKey, EncodePrivateKey, LineEnding},
    traits::PublicKeyParts,
    RsaPrivateKey,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::domain::error::DomainError;
use crate::infrastructure::auth::AuthClaims;

const INTERNAL_ISSUER: &str = "internal";
const KEY_BITS: usize = 2048;

/// Claims used in internal service tokens (no audience requirement).
#[derive(Debug, Serialize, Deserialize)]
struct InternalClaims {
    pub sub: String,
    pub iss: String,
    pub iat: i64,
    pub jti: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

/// Manages the local RSA key pair, issues and validates "internal" service tokens.
///
/// On every startup it:
/// 1. Loads `config/server.key` (PKCS#8 PEM) — or generates a fresh 2048-bit RSA key and saves it.
/// 2. Writes a signed JWT to `config/token.txt` (the master admin token).
/// 3. Writes the public key as a JWK set to `config/certs.json`.
pub struct TokenManager {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    pub key_id: String,
    pub service_token: String,
}

impl TokenManager {
    /// Load (or generate) the key pair, then create & persist the service token.
    pub fn load_or_generate(config_dir: &Path) -> anyhow::Result<Self> {
        let key_path = config_dir.join("server.key");

        let private_pem: String = if key_path.exists() {
            tracing::info!("Loading RSA key from {}", key_path.display());
            std::fs::read_to_string(&key_path)?
        } else {
            tracing::info!("Generating new RSA-{KEY_BITS} key → {}", key_path.display());
            let private_key = tokio::task::block_in_place(|| {
                let mut rng = rand::rngs::OsRng;
                RsaPrivateKey::new(&mut rng, KEY_BITS)
            })?;
            let pem = private_key.to_pkcs8_pem(LineEnding::LF)?.to_string();
            std::fs::write(&key_path, &pem)?;
            pem
        };

        let private_key = RsaPrivateKey::from_pkcs8_pem(&private_pem)?;
        let public_key = private_key.to_public_key();

        // Build a stable key-id from the SHA-256 of the modulus bytes
        let modulus_bytes = public_key.n().to_bytes_be();
        let key_id = sha256_hex(&modulus_bytes)[..40].to_string();

        let encoding_key = EncodingKey::from_rsa_pem(private_pem.as_bytes())?;

        // Build the PKCS#8 public key PEM for the decoding key
        let pub_pem = {
            use rsa::pkcs8::EncodePublicKey;
            public_key.to_public_key_pem(LineEnding::LF)?.to_string()
        };
        let decoding_key = DecodingKey::from_rsa_pem(pub_pem.as_bytes())?;

        let mut mgr = TokenManager {
            encoding_key,
            decoding_key,
            key_id,
            service_token: String::new(),
        };

        // Generate the master service token
        mgr.service_token = mgr.create_service_token()?;

        // Write token.txt and certs.json
        std::fs::write(config_dir.join("token.txt"), &mgr.service_token)?;
        write_certs_json(config_dir, &public_key, &mgr.key_id)?;

        tracing::info!(
            "Master token written to {}",
            config_dir.join("token.txt").display()
        );

        Ok(mgr)
    }

    /// Create a new signed JWT with `sub: "admin"`, `iss: "internal"`.
    pub fn create_service_token(&self) -> anyhow::Result<String> {
        let now = chrono::Utc::now().timestamp();
        let claims = InternalClaims {
            sub: "admin".to_string(),
            iss: INTERNAL_ISSUER.to_string(),
            iat: now,
            jti: Uuid::new_v4().to_string(),
            token_type: Some("SERVICE".to_string()),
            email: None,
        };
        let mut header = Header::new(Algorithm::RS512);
        header.kid = Some(self.key_id.clone());
        Ok(encode(&header, &claims, &self.encoding_key)?)
    }

    /// Validate an "internal" JWT. Returns `AuthClaims` on success.
    pub fn validate(&self, token: &str) -> Result<AuthClaims, DomainError> {
        let mut validation = Validation::new(Algorithm::RS512);
        // Internal service tokens have no expiry (same as Java implementation)
        validation.validate_exp = false;
        validation.required_spec_claims = std::collections::HashSet::new();
        // Internal tokens have no audience — skip that check
        validation.validate_aud = false;
        validation.set_issuer(&[INTERNAL_ISSUER]);

        let data = decode::<InternalClaims>(token, &self.decoding_key, &validation)
            .map_err(|e| DomainError::Forbidden(format!("Invalid internal token: {e}")))?;

        Ok(AuthClaims {
            sub: data.claims.sub,
            iss: data.claims.iss,
            aud: serde_json::Value::Array(vec![]),
            exp: 0,
            email: data.claims.email,
            preferred_username: None,
        })
    }
}

/// Write `config/certs.json` — the public JWK set consumed by CLI tools and
/// any peer that wants to validate "internal" tokens locally.
fn write_certs_json(
    config_dir: &Path,
    public_key: &rsa::RsaPublicKey,
    kid: &str,
) -> anyhow::Result<()> {
    use serde_json::{json, to_string_pretty};

    let n = URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be());
    let e = URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be());

    let jwks = json!({
        "keys": [{
            "kid": kid,
            "use": "sig",
            "kty": "RSA",
            "alg": "RS512",
            "n": n,
            "e": e
        }]
    });

    std::fs::write(config_dir.join("certs.json"), to_string_pretty(&jwks)?)?;
    Ok(())
}

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(data);
    hash.iter().fold(String::new(), |mut out, b| {
        use std::fmt::Write;
        let _ = write!(out, "{b:02x}");
        out
    })
}
