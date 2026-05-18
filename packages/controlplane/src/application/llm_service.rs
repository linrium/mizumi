use async_openai::{
    Client,
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestSystemMessage, ChatCompletionRequestUserMessage,
        CreateChatCompletionRequestArgs, ResponseFormat,
    },
};
use serde::Deserialize;

use crate::{
    domain::{entities::permission::BlastRadiusPreview, error::AppError},
    infrastructure::config::OpenAiConfig,
};

#[derive(Clone)]
pub struct LlmService {
    client: Client<OpenAIConfig>,
    model: String,
}

#[derive(Debug, Clone)]
pub struct LlmBlastRadiusAnalysis {
    pub recommended_guardrail: String,
    pub risk_level: String,
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
        let openai_config = OpenAIConfig::new()
            .with_api_key(api_key)
            .with_api_base(config.base_url.trim_end_matches('/'));
        Some(Self {
            client: Client::with_config(openai_config),
            model: config.model.clone(),
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
            privs = privileges.join(", "),
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

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .response_format(ResponseFormat::JsonObject)
            .messages([
                ChatCompletionRequestSystemMessage::from(system_prompt).into(),
                ChatCompletionRequestUserMessage::from(user_content.as_str()).into(),
            ])
            .build()
            .map_err(|e| AppError::QueryFailed(format!("LLM request build error: {e}")))?;

        let response = self
            .client
            .chat()
            .create(request)
            .await
            .map_err(|e| AppError::QueryFailed(format!("LLM API error: {e}")))?;

        let content = response
            .choices
            .into_iter()
            .next()
            .and_then(|c| c.message.content)
            .unwrap_or_default();

        let parsed: LlmAnalysisResponse = serde_json::from_str(&content)
            .map_err(|e| AppError::QueryFailed(format!("LLM JSON parse error: {e}")))?;

        let risk_level = match parsed.risk_level.to_lowercase().as_str() {
            "low" => "low",
            "medium" => "medium",
            "high" => "high",
            other => {
                tracing::warn!(
                    risk = other,
                    "LLM returned unknown risk level, defaulting to medium"
                );
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
