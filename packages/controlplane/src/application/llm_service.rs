use std::time::Duration;

use serde::Deserialize;
use serde_json::json;

use crate::{
    domain::{
        entities::permission::BlastRadiusPreview,
        error::AppError,
    },
    infrastructure::config::OpenAiConfig,
};

const REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Clone)]
pub struct LlmService {
    client: reqwest::Client,
    api_key: String,
    model: String,
    chat_completions_url: String,
}

#[derive(Debug, Clone)]
pub struct LlmBlastRadiusAnalysis {
    pub recommended_guardrail: String,
    pub risk_level: String,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct LlmAnalysisResponse {
    recommended_guardrail: String,
    risk_level: String,
}

impl LlmService {
    /// Returns `None` when the API key is not configured.
    pub fn new(config: &OpenAiConfig) -> Option<Self> {
        let api_key = config.api_key.trim().to_string();
        if api_key.is_empty() {
            return None;
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("failed to build reqwest client for LLM service");
        let base_url = config.base_url.trim_end_matches('/');
        Some(Self {
            client,
            api_key,
            model: config.model.clone(),
            chat_completions_url: format!("{base_url}/chat/completions"),
        })
    }

    /// Analyze a blast-radius preview and return a recommended guardrail and risk level.
    ///
    /// `risk_level` is guaranteed to be one of `"low"`, `"medium"`, or `"high"`.
    pub async fn analyze_blast_radius(
        &self,
        resource: &str,
        scope: &str,
        privileges: &[String],
        rationale: &str,
        preview: &BlastRadiusPreview,
    ) -> Result<LlmBlastRadiusAnalysis, AppError> {
        let system_prompt = "\
You are a data-governance risk analyst. \
Given a data-access request and its blast-radius impact, respond with a JSON object \
containing exactly two keys:\n\
  \"recommended_guardrail\": a concise, actionable guardrail recommendation (max 120 chars),\n\
  \"risk_level\": one of exactly \"low\", \"medium\", or \"high\".\n\
Respond with raw JSON only — no markdown fences, no explanation.";

        let sensitive_domains = preview.sensitive_domains.join(", ");
        let user_content = format!(
            "Resource: {resource}\n\
Scope: {scope}\n\
Privileges: {privs}\n\
Rationale: {rationale}\n\
\n\
Blast-radius stats:\n\
  total_downstream_nodes: {total}\n\
  direct_downstream_nodes: {direct}\n\
  downstream_tables: {tables}\n\
  downstream_assets: {assets}\n\
  downstream_jobs: {jobs}\n\
  downstream_schedules: {schedules}\n\
  dashboards: {dashboards}\n\
  consumers: {consumers}\n\
  sensitive_domains: [{sensitive}]\n\
  derived_risk: {derived}",
            resource = resource,
            scope = scope,
            privs = privileges.join(", "),
            rationale = rationale,
            total = preview.total_downstream_nodes,
            direct = preview.direct_downstream_nodes,
            tables = preview.downstream_tables,
            assets = preview.downstream_assets,
            jobs = preview.downstream_jobs,
            schedules = preview.downstream_schedules,
            dashboards = preview.dashboards,
            consumers = preview.consumers,
            sensitive = sensitive_domains,
            derived = preview.derived_risk,
        );

        let body = json!({
            "model": self.model,
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user",   "content": user_content }
            ]
        });

        let response = self
            .client
            .post(&self.chat_completions_url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::QueryFailed(format!("LLM request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::QueryFailed(format!(
                "LLM API error {status}: {text}"
            )));
        }

        let chat: ChatResponse = response
            .json()
            .await
            .map_err(|e| AppError::QueryFailed(format!("LLM response parse error: {e}")))?;

        let content = chat
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .unwrap_or_default();

        let parsed: LlmAnalysisResponse = serde_json::from_str(&content)
            .map_err(|e| AppError::QueryFailed(format!("LLM JSON parse error: {e}")))?;

        let risk_level = match parsed.risk_level.to_lowercase().as_str() {
            "low" => "low",
            "medium" => "medium",
            "high" => "high",
            other => {
                tracing::warn!(risk = other, "LLM returned unknown risk level, defaulting to medium");
                "medium"
            }
        }
        .to_string();

        let recommended_guardrail = parsed.recommended_guardrail.chars().take(240).collect();

        Ok(LlmBlastRadiusAnalysis {
            recommended_guardrail,
            risk_level,
        })
    }
}
