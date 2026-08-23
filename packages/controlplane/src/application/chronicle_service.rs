use chrono::{DateTime, Utc};
use reqwest::StatusCode;
use serde::Serialize;
use serde_json::{Value, json};

use crate::infrastructure::config::ChronicleConfig;

#[derive(Clone)]
pub struct ChronicleAuditService {
    enabled: bool,
    base_url: String,
    source: String,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct ChronicleAuditEntry<'a> {
    event_type: &'a str,
    occurred_at: DateTime<Utc>,
    source: &'a str,
    payload: Value,
}

impl ChronicleAuditService {
    pub fn new(config: ChronicleConfig) -> Self {
        Self {
            enabled: config.enabled,
            base_url: config.base_url.trim_end_matches('/').to_string(),
            source: config.source,
            client: reqwest::Client::new(),
        }
    }

    pub async fn record(&self, event_type: &str, payload: Value) {
        if !self.enabled {
            return;
        }

        let entry = ChronicleAuditEntry {
            event_type,
            occurred_at: Utc::now(),
            source: &self.source,
            payload,
        };

        let body = match serde_json::to_vec(&entry) {
            Ok(body) => body,
            Err(error) => {
                tracing::warn!(%event_type, %error, "failed to serialize Chronicle audit entry");
                return;
            }
        };

        let url = format!("{}/entries", self.base_url);
        match self
            .client
            .post(url)
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
        {
            Ok(response) if response.status() == StatusCode::CREATED => {}
            Ok(response) => {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                tracing::warn!(%event_type, %status, body, "Chronicle audit append failed");
            }
            Err(error) => {
                tracing::warn!(%event_type, %error, "Chronicle audit append request failed");
            }
        }
    }

    pub async fn record_error(&self, event_type: &str, error: &str, payload: Value) {
        self.record(
            event_type,
            json!({
                "outcome": "error",
                "error": error,
                "context": payload,
            }),
        )
        .await;
    }
}
