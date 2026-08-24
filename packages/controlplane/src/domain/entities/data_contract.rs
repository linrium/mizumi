use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::entities::semantic_registry::{
    SemanticDefinition, SemanticDefinitionDetail, SemanticDefinitionSummary,
    SemanticPhysicalDependencyInput,
};

#[derive(Debug, Clone, Deserialize)]
pub struct CreateDataContractRequest {
    pub namespace: String,
    pub name: String,
    pub version: i32,
    pub owner_principal: String,
    #[serde(default)]
    pub description: String,
    pub odcs: Value,
    #[serde(default)]
    pub supersedes_version: Option<i32>,
    #[serde(default)]
    pub physical_dependencies: Vec<SemanticPhysicalDependencyInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportDataContractFromUcRequest {
    pub table: String,
    #[serde(default = "default_version")]
    pub version: i32,
    #[serde(default)]
    pub owner_principal: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub sla_properties: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ValidateDataContractRequest {
    #[serde(default)]
    pub metadata_only: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct RunDataContractQualityRequest {
    #[serde(default)]
    pub id_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataContractQualityResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<uuid::Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_at: Option<DateTime<Utc>>,
    pub checked_at: DateTime<Utc>,
    pub status: String,
    pub warnings: Vec<String>,
    pub checks: Vec<DataContractQualityCheckResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataContractQualityCheckResult {
    pub id: String,
    pub description: String,
    pub field: Option<String>,
    pub status: String,
    pub message: String,
    pub failed_rows: Option<i64>,
    pub total_rows: Option<i64>,
    pub query: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DataContractRuntimeStatusQuery {
    #[serde(default)]
    pub asset_key: Option<String>,
    #[serde(default)]
    pub schedule_name: Option<String>,
    #[serde(default)]
    pub max_age_hours: Option<f64>,
    #[serde(default)]
    pub availability_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataContractRuntimeStatus {
    pub checked_at: DateTime<Utc>,
    pub status: String,
    pub warnings: Vec<String>,
    pub checks: Vec<DataContractRuntimeCheck>,
    pub dagster: DataContractDagsterRuntime,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataContractRuntimeCheck {
    pub check: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DataContractDagsterRuntime {
    pub asset_key: Option<String>,
    pub schedule_name: Option<String>,
    pub schedule_status: Option<String>,
    pub cron_schedule: Option<String>,
    pub last_tick_status: Option<String>,
    pub last_tick_timestamp: Option<f64>,
    pub latest_run_status: Option<String>,
    pub latest_run_id: Option<String>,
    pub latest_materialization_timestamp: Option<String>,
    pub latest_materialization_run_id: Option<String>,
    pub in_progress_run_ids: Vec<String>,
    pub unstarted_run_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataContractSummary {
    #[serde(flatten)]
    pub definition: SemanticDefinitionSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataContractDetail {
    #[serde(flatten)]
    pub detail: SemanticDefinitionDetail,
    pub validation: DataContractValidationResult,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataContractValidationResult {
    pub valid: bool,
    pub checked_at: DateTime<Utc>,
    pub checks: Vec<DataContractValidationCheck>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataContractValidationCheck {
    pub result: String,
    pub check: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl DataContractDetail {
    pub fn new(detail: SemanticDefinitionDetail) -> Self {
        let validation = validate_odcs(&detail.definition.spec, false);
        Self { detail, validation }
    }
}

pub fn validate_odcs(odcs: &Value, metadata_only: bool) -> DataContractValidationResult {
    let mut checks = Vec::new();

    require_string(odcs, "apiVersion", &mut checks);
    require_string(odcs, "kind", &mut checks);
    require_string(odcs, "id", &mut checks);
    require_string(odcs, "version", &mut checks);
    require_string(odcs, "status", &mut checks);
    require_array(odcs, "schema", &mut checks);

    if odcs.get("kind").and_then(Value::as_str) != Some("DataContract") {
        checks.push(failed("kind", "kind must be DataContract"));
    }

    validate_schema(odcs, &mut checks);

    if !metadata_only {
        validate_quality_shape(odcs, &mut checks);
        validate_sla_shape(odcs, &mut checks);
    }

    let valid = checks.iter().all(|check| check.result == "passed");
    DataContractValidationResult {
        valid,
        checked_at: Utc::now(),
        checks,
    }
}

fn require_string(odcs: &Value, field: &str, checks: &mut Vec<DataContractValidationCheck>) {
    match odcs.get(field).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => checks.push(passed(field)),
        _ => checks.push(failed(field, &format!("{field} is required"))),
    }
}

fn require_array(odcs: &Value, field: &str, checks: &mut Vec<DataContractValidationCheck>) {
    match odcs.get(field).and_then(Value::as_array) {
        Some(values) if !values.is_empty() => checks.push(passed(field)),
        _ => checks.push(failed(field, &format!("{field} must be a non-empty array"))),
    }
}

fn validate_schema(odcs: &Value, checks: &mut Vec<DataContractValidationCheck>) {
    let Some(schema) = odcs.get("schema").and_then(Value::as_array) else {
        return;
    };

    for object in schema {
        let object_name = object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("<unnamed>");
        if object.get("name").and_then(Value::as_str).is_none() {
            checks.push(failed("schema.name", "schema object name is required"));
        }
        if object.get("logicalType").and_then(Value::as_str).is_none() {
            checks.push(failed(
                &format!("{object_name}.logicalType"),
                "schema object logicalType is required",
            ));
        }
        if let Some(properties) = object.get("properties").and_then(Value::as_array) {
            for property in properties {
                let property_name = property
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("<unnamed>");
                if property.get("name").and_then(Value::as_str).is_none() {
                    checks.push(failed(
                        &format!("{object_name}.properties.name"),
                        "property name is required",
                    ));
                }
                if property
                    .get("logicalType")
                    .and_then(Value::as_str)
                    .is_none()
                {
                    checks.push(failed(
                        &format!("{object_name}.{property_name}.logicalType"),
                        "property logicalType is required",
                    ));
                }
            }
        }
    }
}

fn validate_quality_shape(odcs: &Value, checks: &mut Vec<DataContractValidationCheck>) {
    let Some(schema) = odcs.get("schema").and_then(Value::as_array) else {
        return;
    };

    for object in schema {
        validate_quality_array(object, object.get("name").and_then(Value::as_str), checks);
        if let Some(properties) = object.get("properties").and_then(Value::as_array) {
            for property in properties {
                validate_quality_array(
                    property,
                    property.get("name").and_then(Value::as_str),
                    checks,
                );
            }
        }
    }
}

fn validate_quality_array(
    element: &Value,
    field: Option<&str>,
    checks: &mut Vec<DataContractValidationCheck>,
) {
    let Some(quality) = element.get("quality") else {
        return;
    };
    let Some(quality) = quality.as_array() else {
        checks.push(failed(
            field.unwrap_or("quality"),
            "quality must be an array when present",
        ));
        return;
    };
    for rule in quality {
        let has_text = rule.get("description").and_then(Value::as_str).is_some();
        let has_metric = rule.get("metric").and_then(Value::as_str).is_some();
        let has_sql = rule.get("query").and_then(Value::as_str).is_some();
        if has_text || has_metric || has_sql {
            checks.push(passed(field.unwrap_or("quality")));
        } else {
            checks.push(failed(
                field.unwrap_or("quality"),
                "quality rule needs description, metric, or query",
            ));
        }

        if let Some(query) = rule.get("query").and_then(Value::as_str) {
            if query.trim().is_empty() {
                checks.push(failed(
                    field.unwrap_or("quality"),
                    "quality query cannot be empty",
                ));
            } else if !query
                .trim_start()
                .to_ascii_lowercase()
                .starts_with("select")
            {
                checks.push(failed(
                    field.unwrap_or("quality"),
                    "quality query must be a SELECT statement",
                ));
            }
        }
    }
}

fn validate_sla_shape(odcs: &Value, checks: &mut Vec<DataContractValidationCheck>) {
    let Some(sla_properties) = odcs.get("slaProperties") else {
        return;
    };
    let Some(sla_properties) = sla_properties.as_array() else {
        checks.push(failed(
            "slaProperties",
            "slaProperties must be an array when present",
        ));
        return;
    };

    for (index, sla) in sla_properties.iter().enumerate() {
        let field = sla
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .map(|id| format!("slaProperties.{id}"))
            .unwrap_or_else(|| format!("slaProperties[{index}]"));

        let Some(property) = sla.get("property").and_then(Value::as_str) else {
            checks.push(failed(&field, "SLA property is required"));
            continue;
        };
        if property.trim().is_empty() {
            checks.push(failed(&field, "SLA property is required"));
            continue;
        }

        if !has_scalar_value(sla.get("value")) {
            checks.push(failed(&field, "SLA value is required"));
            continue;
        }

        let property_lower = property.to_ascii_lowercase();
        if matches!(
            property_lower.as_str(),
            "frequency" | "fy" | "latency" | "ly" | "retention" | "re"
        ) && !is_indefinite_retention(&property_lower, sla.get("value"))
            && sla
                .get("unit")
                .and_then(Value::as_str)
                .is_none_or(|unit| unit.trim().is_empty())
        {
            checks.push(failed(
                &field,
                "SLA unit is required for frequency, latency, and retention",
            ));
            continue;
        }

        if let Some(driver) = sla.get("driver").and_then(Value::as_str) {
            let driver_lower = driver.to_ascii_lowercase();
            if !matches!(
                driver_lower.as_str(),
                "regulatory" | "analytics" | "operational"
            ) {
                checks.push(failed(
                    &field,
                    "SLA driver must be regulatory, analytics, or operational",
                ));
                continue;
            }
        }

        if sla.get("schedule").is_some()
            && sla
                .get("scheduler")
                .and_then(Value::as_str)
                .is_none_or(|scheduler| scheduler.trim().is_empty())
        {
            checks.push(failed(
                &field,
                "SLA scheduler is required when schedule is present",
            ));
            continue;
        }

        checks.push(passed(&field));
    }
}

fn is_indefinite_retention(property: &str, value: Option<&Value>) -> bool {
    if !matches!(property, "retention" | "re") {
        return false;
    }

    value.and_then(Value::as_str).is_some_and(|value| {
        matches!(
            value.to_ascii_lowercase().as_str(),
            "forever" | "indefinite"
        )
    })
}

fn has_scalar_value(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Number(_) | Value::Bool(_)) => true,
        _ => false,
    }
}

fn passed(field: &str) -> DataContractValidationCheck {
    DataContractValidationCheck {
        result: "passed".to_string(),
        check: "ODCS structure".to_string(),
        field: Some(field.to_string()),
        details: None,
    }
}

fn failed(field: &str, details: &str) -> DataContractValidationCheck {
    DataContractValidationCheck {
        result: "failed".to_string(),
        check: "ODCS structure".to_string(),
        field: Some(field.to_string()),
        details: Some(details.to_string()),
    }
}

fn default_version() -> i32 {
    1
}

pub fn is_data_contract(definition: &SemanticDefinition) -> bool {
    definition.object_type == "data_contract"
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::validate_odcs;

    fn valid_contract_with_sla(sla_properties: serde_json::Value) -> serde_json::Value {
        json!({
            "apiVersion": "v3.1.0",
            "kind": "DataContract",
            "id": "contract-1",
            "version": "1",
            "status": "draft",
            "schema": [{
                "name": "orders",
                "logicalType": "object",
                "properties": [{
                    "name": "created_at",
                    "logicalType": "timestamp"
                }]
            }],
            "slaProperties": sla_properties
        })
    }

    #[test]
    fn validates_odcs_sla_properties() {
        let result = validate_odcs(
            &valid_contract_with_sla(json!([{
                "id": "daily_frequency",
                "property": "frequency",
                "value": "1",
                "unit": "d",
                "element": "orders.created_at",
                "scheduler": "dagster",
                "schedule": "0 2 * * *",
                "driver": "analytics"
            }])),
            false,
        );

        assert!(result.valid);
    }

    #[test]
    fn rejects_sla_frequency_without_unit() {
        let result = validate_odcs(
            &valid_contract_with_sla(json!([{
                "id": "daily_frequency",
                "property": "frequency",
                "value": "1"
            }])),
            false,
        );

        assert!(!result.valid);
        assert!(
            result
                .checks
                .iter()
                .any(|check| check.field.as_deref() == Some("slaProperties.daily_frequency"))
        );
    }

    #[test]
    fn allows_indefinite_retention_without_unit() {
        let result = validate_odcs(
            &valid_contract_with_sla(json!([{
                "id": "default_retention",
                "property": "retention",
                "value": "forever"
            }])),
            false,
        );

        assert!(result.valid);
    }
}
