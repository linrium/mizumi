use std::sync::Arc;
use async_trait::async_trait;
use crate::domain::{
    entities::user::{CreateUser, UpdateUser, User},
    error::DomainError,
    ports::{inbound::UserUseCase, outbound::UserRepository},
};

pub struct UserService {
    repo: Arc<dyn UserRepository>,
}

impl UserService {
    pub fn new(repo: Arc<dyn UserRepository>) -> Self {
        Self { repo }
    }
}

#[async_trait]
impl UserUseCase for UserService {
    async fn create_user(&self, cmd: CreateUser) -> Result<User, DomainError> {
        self.repo.create(cmd).await
    }

    async fn list_users(&self, start_index: Option<usize>, count: Option<usize>) -> Result<Vec<User>, DomainError> {
        let start = start_index.unwrap_or(0);
        let limit = count.unwrap_or(50).min(200);
        self.repo.list(start, limit).await
    }

    async fn get_user(&self, id: &str) -> Result<User, DomainError> {
        self.repo.get(id).await
    }

    async fn update_user(&self, id: &str, cmd: UpdateUser) -> Result<User, DomainError> {
        self.repo.update(id, cmd).await
    }

    async fn delete_user(&self, id: &str) -> Result<(), DomainError> {
        self.repo.delete(id).await
    }
}
