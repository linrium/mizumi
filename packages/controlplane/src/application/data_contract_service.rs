use std::time::Duration;

use chrono::Utc;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::kubernetes::data_contract as data_contract_k8s,
    application::{
        semantic_registry_service::SemanticRegistryService, uc_service::UnityCatalogProxyService,
    },
    domain::{
        entities::{
            data_contract::{
                CreateDataContractRequest, DataContractDetail, DataContractSummary,
                DataContractValidationCheck, DataContractValidationResult,
                ImportDataContractFromUcRequest, ValidateDataContractRequest, is_data_contract,
                validate_odcs,
            },
            semantic_registry::{
                CreateSemanticDefinitionRequest, SemanticDefinitionsQuery,
                SemanticPhysicalDependencyInput, TransitionSemanticStatusRequest,
            },
        },
        error::AppError,
    },
    infrastructure::config::DataContractCliConfig,
};

#[derive(Clone)]
pub struct DataContractService {
    semantic_registry: SemanticRegistryService,
    uc_service: UnityCatalogProxyService,
    cli: DataContractCliConfig,
}

impl DataContractService {
    pub fn new(
        db: PgPool,
        uc_service: UnityCatalogProxyService,
        cli: DataContractCliConfig,
    ) -> Self {
        Self {
            semantic_registry: SemanticRegistryService::new(db),
            uc_service,
            cli,
        }
    }

    pub async fn list_contracts(
        &self,
        mut query: SemanticDefinitionsQuery,
    ) -> Result<Vec<DataContractSummary>, AppError> {
        query.object_type = Some("data_contract".to_string());
        Ok(self
            .semantic_registry
            .list_definitions(query)
            .await?
            .into_iter()
            .map(|definition| DataContractSummary { definition })
            .collect())
    }

    pub async fn list_versions(
        &self,
        namespace: &str,
        name: &str,
    ) -> Result<Vec<crate::domain::entities::semantic_registry::SemanticDefinition>, AppError> {
        let versions = self
            .semantic_registry
            .list_versions(namespace, name)
            .await?;
        Ok(versions.into_iter().filter(is_data_contract).collect())
    }

    pub async fn get_detail(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
    ) -> Result<DataContractDetail, AppError> {
        let detail = self
            .semantic_registry
            .get_detail(namespace, name, version)
            .await?;
        ensure_data_contract(&detail.definition)?;
        Ok(DataContractDetail::new(detail))
    }

    pub async fn create_contract(
        &self,
        req: CreateDataContractRequest,
        principal: &str,
    ) -> Result<DataContractDetail, AppError> {
        let validation = validate_odcs(&req.odcs, false);
        if !validation.valid {
            return Err(AppError::BadRequest(format!(
                "ODCS contract is invalid: {}",
                validation
                    .checks
                    .iter()
                    .filter(|check| check.result == "failed")
                    .filter_map(|check| check.details.as_deref())
                    .collect::<Vec<_>>()
                    .join("; ")
            )));
        }

        let detail = self
            .semantic_registry
            .create_definition(
                CreateSemanticDefinitionRequest {
                    namespace: req.namespace,
                    name: req.name,
                    object_type: "data_contract".to_string(),
                    version: req.version,
                    owner_principal: req.owner_principal,
                    description: req.description,
                    spec: req.odcs,
                    time_semantics: None,
                    supersedes_version: req.supersedes_version,
                    dependencies: Vec::new(),
                    physical_dependencies: req.physical_dependencies,
                },
                principal,
            )
            .await?;
        Ok(DataContractDetail::new(detail))
    }

    pub async fn import_from_uc(
        &self,
        req: ImportDataContractFromUcRequest,
        principal: &str,
    ) -> Result<DataContractDetail, AppError> {
        validate_full_table_name(&req.table)?;
        if req.version <= 0 {
            return Err(AppError::BadRequest(
                "version must be greater than zero".into(),
            ));
        }

        let table = self
            .uc_service
            .get_table(&req.table)
            .await
            .map_err(AppError::QueryFailed)?;
        let odcs = odcs_from_uc_table(&table, &req)?;
        let (catalog, schema_name, object_name) = split_table_name(&req.table)?;
        let owner = req
            .owner_principal
            .clone()
            .or_else(|| {
                table
                    .get("owner")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| principal.to_string());
        let description = table
            .get("comment")
            .and_then(Value::as_str)
            .unwrap_or("Generated from Unity Catalog table metadata")
            .to_string();

        self.create_contract(
            CreateDataContractRequest {
                namespace: format!("{catalog}.{schema_name}"),
                name: object_name.clone(),
                version: req.version,
                owner_principal: owner,
                description,
                odcs,
                supersedes_version: None,
                physical_dependencies: vec![SemanticPhysicalDependencyInput {
                    catalog,
                    schema_name,
                    object_name,
                    object_type: "table".to_string(),
                    contract_version: Some(req.version),
                }],
            },
            principal,
        )
        .await
    }

    pub async fn validate_contract(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
        req: ValidateDataContractRequest,
    ) -> Result<crate::domain::entities::data_contract::DataContractValidationResult, AppError>
    {
        let detail = self.get_detail(namespace, name, version).await?;
        if self.cli.enabled {
            return self.validate_with_cli(&detail).await;
        }
        Ok(validate_odcs(
            &detail.detail.definition.spec,
            req.metadata_only,
        ))
    }

    pub async fn activate_contract(
        &self,
        namespace: &str,
        name: &str,
        version: i32,
        principal: &str,
    ) -> Result<DataContractDetail, AppError> {
        let detail = self.get_detail(namespace, name, version).await?;
        let validation = validate_odcs(&detail.detail.definition.spec, false);
        if !validation.valid {
            return Err(AppError::BadRequest(
                "cannot activate an invalid data contract".into(),
            ));
        }

        let current = detail.detail.definition.status.as_str();
        let steps = match current {
            "draft" => ["validated", "candidate", "certified", "active"].as_slice(),
            "validated" => ["candidate", "certified", "active"].as_slice(),
            "candidate" => ["certified", "active"].as_slice(),
            "certified" => ["active"].as_slice(),
            "active" => return Ok(detail),
            _ => {
                return Err(AppError::BadRequest(format!(
                    "cannot activate contract from status {current}"
                )));
            }
        };

        let mut updated = None;
        for status in steps {
            updated = Some(
                self.semantic_registry
                    .transition_status(
                        namespace,
                        name,
                        version,
                        TransitionSemanticStatusRequest {
                            status: (*status).to_string(),
                            reason: Some("data contract validation passed".to_string()),
                        },
                        principal,
                    )
                    .await?,
            );
        }

        Ok(DataContractDetail::new(
            updated.expect("activation has at least one step"),
        ))
    }

    pub fn to_yaml(&self, detail: &DataContractDetail) -> Result<String, AppError> {
        serde_yaml::to_string(&detail.detail.definition.spec)
            .map_err(|e| AppError::Parse(format!("failed to serialize ODCS YAML: {e}")))
    }

    async fn validate_with_cli(
        &self,
        detail: &DataContractDetail,
    ) -> Result<DataContractValidationResult, AppError> {
        let yaml = self.to_yaml(detail)?;
        let client = data_contract_k8s::client().await?;
        match data_contract_k8s::lint_contract(
            &client,
            &self.cli.namespace,
            &self.cli.image,
            &yaml,
            Duration::from_secs(self.cli.timeout_seconds),
        )
        .await
        {
            Ok(logs) => Ok(cli_result(true, logs)),
            Err(AppError::QueryFailed(logs)) => Ok(cli_result(false, logs)),
            Err(err) => Err(err),
        }
    }
}

fn cli_result(valid: bool, logs: String) -> DataContractValidationResult {
    DataContractValidationResult {
        valid,
        checked_at: Utc::now(),
        checks: vec![DataContractValidationCheck {
            result: if valid { "passed" } else { "failed" }.to_string(),
            check: "Data Contract CLI lint".to_string(),
            field: None,
            details: Some(logs),
        }],
    }
}

fn ensure_data_contract(
    definition: &crate::domain::entities::semantic_registry::SemanticDefinition,
) -> Result<(), AppError> {
    if is_data_contract(definition) {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

fn validate_full_table_name(full_name: &str) -> Result<(), AppError> {
    let parts = full_name.split('.').collect::<Vec<_>>();
    if parts.len() != 3 || parts.iter().any(|part| part.trim().is_empty()) {
        return Err(AppError::BadRequest(
            "table must be a fully qualified catalog.schema.table name".into(),
        ));
    }
    Ok(())
}

fn split_table_name(full_name: &str) -> Result<(String, String, String), AppError> {
    validate_full_table_name(full_name)?;
    let mut parts = full_name.split('.');
    Ok((
        parts.next().unwrap().to_string(),
        parts.next().unwrap().to_string(),
        parts.next().unwrap().to_string(),
    ))
}

fn odcs_from_uc_table(
    table: &Value,
    req: &ImportDataContractFromUcRequest,
) -> Result<Value, AppError> {
    let full_name = table
        .get("full_name")
        .and_then(Value::as_str)
        .unwrap_or(&req.table);
    let (catalog, schema_name, object_name) = split_table_name(full_name)?;
    let columns = table
        .get("columns")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::BadRequest("Unity Catalog table has no columns".into()))?;

    let properties = columns
        .iter()
        .map(odcs_property_from_uc_column)
        .collect::<Vec<_>>();
    let contract_id = req.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let table_comment = table.get("comment").and_then(Value::as_str);
    let sla_properties = req
        .sla_properties
        .clone()
        .unwrap_or_else(|| default_sla_properties(&schema_name, &object_name));

    Ok(json!({
        "apiVersion": "v3.1.0",
        "kind": "DataContract",
        "id": contract_id,
        "name": full_name,
        "version": req.version.to_string(),
        "status": "draft",
        "domain": catalog,
        "dataProduct": object_name,
        "description": {
            "purpose": table_comment.unwrap_or("Generated from Unity Catalog table metadata."),
            "authoritativeDefinitions": [{
                "url": format!("unity-catalog://{full_name}"),
                "type": "implementation",
                "description": "Unity Catalog table"
            }]
        },
        "schema": [{
            "id": full_name.replace('.', "_"),
            "name": object_name,
            "logicalType": "object",
            "physicalType": "table",
            "physicalName": full_name,
            "description": table_comment,
            "properties": properties,
            "customProperties": [{
                "property": "mizumi.unityCatalog.catalog",
                "value": catalog
            }, {
                "property": "mizumi.unityCatalog.schema",
                "value": schema_name
            }, {
                "property": "mizumi.unityCatalog.storageLocation",
                "value": table.get("storage_location").or_else(|| table.get("url")).and_then(Value::as_str).unwrap_or("")
            }, {
                "property": "mizumi.unityCatalog.format",
                "value": table.get("data_source_format").and_then(Value::as_str).unwrap_or("")
            }]
        }],
        "servers": [{
            "server": "mizumi-unity-catalog",
            "type": "unitycatalog",
            "catalog": catalog,
            "schema": schema_name
        }],
        "slaProperties": sla_properties,
        "customProperties": [{
            "property": "mizumi.contract.generatedFrom",
            "value": "unity-catalog"
        }, {
            "property": "mizumi.contract.physicalName",
            "value": full_name
        }]
    }))
}

fn default_sla_properties(schema_name: &str, object_name: &str) -> Vec<Value> {
    let mut properties = if is_streaming_table(schema_name, object_name) {
        vec![
            json!({
                "id": "stream_latency_15_minutes",
                "property": "latency",
                "value": "15",
                "unit": "minutes",
                "element": object_name,
                "driver": "operational",
                "description": "Streaming bronze data should be queryable within 15 minutes of source arrival."
            }),
            json!({
                "id": "stream_availability",
                "property": "availability",
                "value": "99.5",
                "unit": "percent",
                "element": object_name,
                "driver": "operational",
                "description": "Spark Structured Streaming jobs should keep the target table continuously available."
            }),
        ]
    } else {
        vec![
            json!({
                "id": "daily_frequency",
                "property": "frequency",
                "value": "1",
                "unit": "d",
                "element": object_name,
                "scheduler": "dagster",
                "schedule": "0 2 * * *",
                "driver": "analytics",
                "description": "Dagster cross_sell_daily_schedule refreshes this contract's batch asset daily."
            }),
            json!({
                "id": "daily_time_of_availability",
                "property": "timeOfAvailability",
                "value": "03:00+00:00",
                "element": object_name,
                "scheduler": "dagster",
                "schedule": "0 2 * * *",
                "driver": "analytics",
                "description": "Daily batch outputs should be available after the scheduled Spark materialization window."
            }),
        ]
    };

    properties.push(json!({
        "id": "default_retention",
        "property": "retention",
        "value": "forever",
        "element": object_name,
        "driver": "operational",
        "description": "Mizumi retains this dataset indefinitely."
    }));
    properties
}

fn is_streaming_table(schema_name: &str, object_name: &str) -> bool {
    let schema = schema_name.to_ascii_lowercase();
    let object = object_name.to_ascii_lowercase();
    schema.contains("bronze")
        && (object.contains("transactions")
            || object.contains("tickets")
            || object.contains("incidents")
            || object.contains("events"))
}

fn odcs_property_from_uc_column(column: &Value) -> Value {
    let name = column.get("name").and_then(Value::as_str).unwrap_or("");
    let type_name = column
        .get("type_name")
        .and_then(Value::as_str)
        .unwrap_or("");
    let type_text = column
        .get("type_text")
        .and_then(Value::as_str)
        .unwrap_or(type_name);
    let nullable = column
        .get("nullable")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let mut property = json!({
        "id": name,
        "name": name,
        "logicalType": logical_type(type_name),
        "physicalType": type_text,
        "required": !nullable,
        "description": column.get("comment").and_then(Value::as_str),
        "partitioned": column.get("partition_index").and_then(Value::as_i64).is_some(),
        "customProperties": [{
            "property": "mizumi.unityCatalog.typeName",
            "value": type_name
        }]
    });
    if type_name == "BINARY" {
        property["format"] = Value::String("binary".to_string());
    }
    property
}

fn logical_type(type_name: &str) -> &'static str {
    match type_name {
        "STRING" | "CHAR" | "VARCHAR" | "BINARY" => "string",
        "BYTE" | "SHORT" | "INT" | "LONG" => "integer",
        "FLOAT" | "DOUBLE" | "DECIMAL" => "number",
        "BOOLEAN" => "boolean",
        "DATE" => "date",
        "TIMESTAMP" | "TIMESTAMP_NTZ" => "timestamp",
        "ARRAY" => "array",
        "STRUCT" | "MAP" => "object",
        _ => "string",
    }
}
