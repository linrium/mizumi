use std::sync::Arc;
use async_trait::async_trait;
use crate::domain::{
    entities::metastore::MetastoreInfo,
    error::DomainError,
    ports::{inbound::MetastoreUseCase, outbound::MetastoreRepository},
};

pub struct MetastoreService {
    repo: Arc<dyn MetastoreRepository>,
}

impl MetastoreService {
    pub fn new(repo: Arc<dyn MetastoreRepository>) -> Self {
        Self { repo }
    }
}

#[async_trait]
impl MetastoreUseCase for MetastoreService {
    async fn get_metastore(&self) -> Result<MetastoreInfo, DomainError> {
        self.repo.get().await
    }
}
