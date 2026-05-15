use crate::domain::{
    entities::table::{AwsCredentials, TemporaryCredentials},
    error::DomainError,
};
use crate::infrastructure::config::Config;

#[derive(Clone)]
pub struct TemporaryCredentialsVendor {
    config: Config,
}

impl TemporaryCredentialsVendor {
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    pub fn vend_for_location(
        &self,
        storage_location: &str,
    ) -> Result<TemporaryCredentials, DomainError> {
        let parsed = url::Url::parse(storage_location)
            .map_err(|e| DomainError::InvalidArgument(format!("Invalid storage location: {e}")))?;

        match parsed.scheme() {
            "file" => Ok(TemporaryCredentials::default()),
            "s3" => self.vend_s3(storage_location),
            "abfs" | "abfss" => Err(DomainError::InvalidArgument(
                "ADLS temporary credentials are not implemented in the Rust UC server yet".into(),
            )),
            "gs" => Err(DomainError::InvalidArgument(
                "GCS temporary credentials are not implemented in the Rust UC server yet".into(),
            )),
            scheme => Err(DomainError::InvalidArgument(format!(
                "Unsupported storage scheme for temporary credentials: {scheme}"
            ))),
        }
    }

    fn vend_s3(&self, storage_location: &str) -> Result<TemporaryCredentials, DomainError> {
        let bucket_config = self
            .config
            .s3
            .iter()
            .find(|cfg| storage_location.starts_with(&cfg.bucket_path));

        tracing::debug!(
            storage_location,
            matched_bucket = %bucket_config.map(|c| c.bucket_path.as_str()).unwrap_or("(none)"),
            "vend_s3 lookup",
        );

        let access_key = bucket_config
            .and_then(|cfg| cfg.access_key.clone())
            .or_else(|| self.config.aws.access_key.clone());
        let secret_key = bucket_config
            .and_then(|cfg| cfg.secret_key.clone())
            .or_else(|| self.config.aws.secret_key.clone());
        let session_token = bucket_config.and_then(|cfg| cfg.session_token.clone()).unwrap_or_default();

        match (access_key, secret_key) {
            (Some(access_key_id), Some(secret_access_key)) => Ok(TemporaryCredentials {
                aws_temp_credentials: Some(AwsCredentials {
                    access_key_id,
                    secret_access_key,
                    session_token,
                    endpoint: bucket_config.and_then(|cfg| cfg.endpoint.clone()),
                }),
                azure_user_delegation_sas: None,
                gcp_oauth_token: None,
                expiration_time: None,
            }),
            _ => Err(DomainError::InvalidArgument(format!(
                "No static S3 credentials configured for storage location {storage_location}"
            ))),
        }
    }
}
