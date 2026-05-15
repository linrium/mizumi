use super::table::ColumnTypeName;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionParameterInfo {
    pub name: String,
    pub type_text: String,
    pub type_json: String,
    pub type_name: ColumnTypeName,
    pub type_precision: Option<i32>,
    pub type_scale: Option<i32>,
    pub type_interval_type: Option<String>,
    pub position: i32,
    pub parameter_mode: Option<String>,
    pub parameter_type: Option<String>,
    pub parameter_default: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionParameterInfos {
    pub parameters: Option<Vec<FunctionParameterInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    pub function_id: Uuid,
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub full_name: String,
    pub comment: Option<String>,
    pub owner: Option<String>,
    pub input_params: Option<FunctionParameterInfos>,
    pub return_params: Option<FunctionParameterInfos>,
    pub data_type: Option<ColumnTypeName>,
    pub full_data_type: Option<String>,
    pub routine_body: Option<String>,
    pub routine_definition: Option<String>,
    pub sql_data_access: Option<String>,
    pub is_deterministic: Option<bool>,
    pub is_null_call: Option<bool>,
    pub parameter_style: Option<String>,
    pub security_type: Option<String>,
    pub specific_name: Option<String>,
    pub external_language: Option<String>,
    pub created_at: i64,
    pub created_by: Option<String>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateFunction {
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub comment: Option<String>,
    pub input_params: Option<FunctionParameterInfos>,
    pub return_params: Option<FunctionParameterInfos>,
    pub data_type: Option<ColumnTypeName>,
    pub full_data_type: Option<String>,
    pub routine_body: Option<String>,
    pub routine_definition: Option<String>,
    pub sql_data_access: Option<String>,
    pub is_deterministic: Option<bool>,
    pub is_null_call: Option<bool>,
    pub parameter_style: Option<String>,
    pub security_type: Option<String>,
    pub specific_name: Option<String>,
    pub external_language: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateFunctionRequest {
    pub function_info: CreateFunction,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListFunctionsResponse {
    pub functions: Vec<FunctionInfo>,
    pub next_page_token: Option<String>,
}
