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
}

#[derive(Debug, Clone, Deserialize)]
pub struct ValidateDataContractRequest {
    #[serde(default)]
    pub metadata_only: bool,
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
