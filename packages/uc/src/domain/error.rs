use thiserror::Error;

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    #[error("Invalid argument: {0}")]
    InvalidArgument(String),
    #[error("Precondition failed: {0}")]
    PreconditionFailed(String),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
}
