use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TableType {
    MANAGED,
    EXTERNAL,
}

impl TableType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TableType::MANAGED => "MANAGED",
            TableType::EXTERNAL => "EXTERNAL",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "MANAGED" => Some(TableType::MANAGED),
            "EXTERNAL" => Some(TableType::EXTERNAL),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DataSourceFormat {
    DELTA,
    CSV,
    JSON,
    AVRO,
    PARQUET,
    ORC,
    TEXT,
}

impl DataSourceFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            DataSourceFormat::DELTA => "DELTA",
            DataSourceFormat::CSV => "CSV",
            DataSourceFormat::JSON => "JSON",
            DataSourceFormat::AVRO => "AVRO",
            DataSourceFormat::PARQUET => "PARQUET",
            DataSourceFormat::ORC => "ORC",
            DataSourceFormat::TEXT => "TEXT",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "DELTA" => Some(DataSourceFormat::DELTA),
            "CSV" => Some(DataSourceFormat::CSV),
            "JSON" => Some(DataSourceFormat::JSON),
            "AVRO" => Some(DataSourceFormat::AVRO),
            "PARQUET" => Some(DataSourceFormat::PARQUET),
            "ORC" => Some(DataSourceFormat::ORC),
            "TEXT" => Some(DataSourceFormat::TEXT),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ColumnTypeName {
    BOOLEAN,
    BYTE,
    SHORT,
    INT,
    LONG,
    FLOAT,
    DOUBLE,
    DATE,
    TIMESTAMP,
    TIMESTAMP_NTZ,
    STRING,
    BINARY,
    DECIMAL,
    INTERVAL,
    ARRAY,
    STRUCT,
    MAP,
    CHAR,
    #[serde(rename = "NULL")]
    NULL,
    USER_DEFINED_TYPE,
    TABLE_TYPE,
    VARIANT,
}

impl ColumnTypeName {
    pub fn as_str(&self) -> &'static str {
        match self {
            ColumnTypeName::BOOLEAN => "BOOLEAN",
            ColumnTypeName::BYTE => "BYTE",
            ColumnTypeName::SHORT => "SHORT",
            ColumnTypeName::INT => "INT",
            ColumnTypeName::LONG => "LONG",
            ColumnTypeName::FLOAT => "FLOAT",
            ColumnTypeName::DOUBLE => "DOUBLE",
            ColumnTypeName::DATE => "DATE",
            ColumnTypeName::TIMESTAMP => "TIMESTAMP",
            ColumnTypeName::TIMESTAMP_NTZ => "TIMESTAMP_NTZ",
            ColumnTypeName::STRING => "STRING",
            ColumnTypeName::BINARY => "BINARY",
            ColumnTypeName::DECIMAL => "DECIMAL",
            ColumnTypeName::INTERVAL => "INTERVAL",
            ColumnTypeName::ARRAY => "ARRAY",
            ColumnTypeName::STRUCT => "STRUCT",
            ColumnTypeName::MAP => "MAP",
            ColumnTypeName::CHAR => "CHAR",
            ColumnTypeName::NULL => "NULL",
            ColumnTypeName::USER_DEFINED_TYPE => "USER_DEFINED_TYPE",
            ColumnTypeName::TABLE_TYPE => "TABLE_TYPE",
            ColumnTypeName::VARIANT => "VARIANT",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "BOOLEAN" => Some(ColumnTypeName::BOOLEAN),
            "BYTE" => Some(ColumnTypeName::BYTE),
            "SHORT" => Some(ColumnTypeName::SHORT),
            "INT" => Some(ColumnTypeName::INT),
            "LONG" => Some(ColumnTypeName::LONG),
            "FLOAT" => Some(ColumnTypeName::FLOAT),
            "DOUBLE" => Some(ColumnTypeName::DOUBLE),
            "DATE" => Some(ColumnTypeName::DATE),
            "TIMESTAMP" => Some(ColumnTypeName::TIMESTAMP),
            "TIMESTAMP_NTZ" => Some(ColumnTypeName::TIMESTAMP_NTZ),
            "STRING" => Some(ColumnTypeName::STRING),
            "BINARY" => Some(ColumnTypeName::BINARY),
            "DECIMAL" => Some(ColumnTypeName::DECIMAL),
            "INTERVAL" => Some(ColumnTypeName::INTERVAL),
            "ARRAY" => Some(ColumnTypeName::ARRAY),
            "STRUCT" => Some(ColumnTypeName::STRUCT),
            "MAP" => Some(ColumnTypeName::MAP),
            "CHAR" => Some(ColumnTypeName::CHAR),
            "NULL" => Some(ColumnTypeName::NULL),
            "USER_DEFINED_TYPE" => Some(ColumnTypeName::USER_DEFINED_TYPE),
            "TABLE_TYPE" => Some(ColumnTypeName::TABLE_TYPE),
            "VARIANT" => Some(ColumnTypeName::VARIANT),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub type_text: String,
    pub type_json: Option<String>,
    pub type_name: ColumnTypeName,
    pub type_precision: Option<i32>,
    pub type_scale: Option<i32>,
    pub type_interval_type: Option<String>,
    pub position: i32,
    pub comment: Option<String>,
    pub nullable: Option<bool>,
    pub partition_index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub table_id: Uuid,
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub full_name: String,
    pub table_type: TableType,
    pub data_source_format: Option<DataSourceFormat>,
    pub columns: Option<Vec<ColumnInfo>>,
    pub storage_location: Option<String>,
    pub comment: Option<String>,
    pub properties: Option<HashMap<String, String>>,
    pub owner: Option<String>,
    pub created_at: i64,
    pub created_by: Option<String>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
    pub view_definition: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTable {
    pub name: String,
    pub catalog_name: String,
    pub schema_name: String,
    pub table_type: TableType,
    pub data_source_format: Option<DataSourceFormat>,
    pub columns: Vec<ColumnInfo>,
    pub storage_location: Option<String>,
    pub comment: Option<String>,
    pub properties: Option<HashMap<String, String>>,
    pub view_definition: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListTablesResponse {
    pub tables: Vec<TableInfo>,
    pub next_page_token: Option<String>,
}
