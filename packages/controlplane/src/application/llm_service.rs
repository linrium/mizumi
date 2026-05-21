use async_openai::{
    Client,
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestSystemMessage, ChatCompletionRequestUserMessage,
        CreateChatCompletionRequestArgs, ResponseFormat, ResponseFormatJsonSchema,
    },
};
use serde::Deserialize;
use serde_json::json;

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
    pub recommendation: String,
    pub risk_level: String,
    pub explanation: String,
}

#[derive(Deserialize)]
struct LlmAnalysisResponse {
    recommendation: String,
    risk_level: String,
    explanation: String,
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

    /// Analyze a blast-radius preview and return a recommendation, risk level, and explanation.
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
        let system_prompt = "You are a data-governance risk analyst. \
Analyze the provided data-access request and its blast-radius impact. \
Respond using the required JSON schema.";

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

        let schema = json!({
            "type": "object",
            "properties": {
                "recommendation": {
                    "type": "string",
                    "description": "A concise, actionable guardrail recommendation (max 120 characters)."
                },
                "risk_level": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "The assessed risk level of this access request."
                },
                "explanation": {
                    "type": "string",
                    "description": "A brief explanation (2-3 sentences) of the risk assessment and recommendation."
                }
            },
            "required": ["recommendation", "risk_level", "explanation"],
            "additionalProperties": false
        });

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .response_format(ResponseFormat::JsonSchema {
                json_schema: ResponseFormatJsonSchema {
                    name: "blast_radius_analysis".to_string(),
                    description: Some(
                        "Risk assessment and guardrail recommendation for a data-access request."
                            .to_string(),
                    ),
                    schema: Some(schema),
                    strict: Some(true),
                },
            })
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

        Ok(LlmBlastRadiusAnalysis {
            recommendation: parsed.recommendation.chars().take(240).collect(),
            risk_level,
            explanation: parsed.explanation,
        })
    }
}
