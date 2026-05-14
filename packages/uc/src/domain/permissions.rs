use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Privilege {
    Owner,
    CreateCatalog,
    UseCatalog,
    CreateSchema,
    UseSchema,
    CreateTable,
    Select,
    Modify,
    CreateFunction,
    Execute,
    CreateVolume,
    ReadVolume,
    CreateModel,
    CreateExternalLocation,
    ReadFiles,
    WriteFiles,
    CreateExternalTable,
    CreateExternalVolume,
    CreateManagedStorage,
    CreateStorageCredential,
}

impl Privilege {
    pub fn as_str(&self) -> &'static str {
        match self {
            Privilege::Owner => "OWNER",
            Privilege::CreateCatalog => "CREATE_CATALOG",
            Privilege::UseCatalog => "USE_CATALOG",
            Privilege::CreateSchema => "CREATE_SCHEMA",
            Privilege::UseSchema => "USE_SCHEMA",
            Privilege::CreateTable => "CREATE_TABLE",
            Privilege::Select => "SELECT",
            Privilege::Modify => "MODIFY",
            Privilege::CreateFunction => "CREATE_FUNCTION",
            Privilege::Execute => "EXECUTE",
            Privilege::CreateVolume => "CREATE_VOLUME",
            Privilege::ReadVolume => "READ_VOLUME",
            Privilege::CreateModel => "CREATE_MODEL",
            Privilege::CreateExternalLocation => "CREATE_EXTERNAL_LOCATION",
            Privilege::ReadFiles => "READ_FILES",
            Privilege::WriteFiles => "WRITE_FILES",
            Privilege::CreateExternalTable => "CREATE_EXTERNAL_TABLE",
            Privilege::CreateExternalVolume => "CREATE_EXTERNAL_VOLUME",
            Privilege::CreateManagedStorage => "CREATE_MANAGED_STORAGE",
            Privilege::CreateStorageCredential => "CREATE_STORAGE_CREDENTIAL",
        }
    }
}

impl std::fmt::Display for Privilege {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for Privilege {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "OWNER" => Ok(Privilege::Owner),
            "CREATE_CATALOG" => Ok(Privilege::CreateCatalog),
            "USE_CATALOG" => Ok(Privilege::UseCatalog),
            "CREATE_SCHEMA" => Ok(Privilege::CreateSchema),
            "USE_SCHEMA" => Ok(Privilege::UseSchema),
            "CREATE_TABLE" => Ok(Privilege::CreateTable),
            "SELECT" => Ok(Privilege::Select),
            "MODIFY" => Ok(Privilege::Modify),
            "CREATE_FUNCTION" => Ok(Privilege::CreateFunction),
            "EXECUTE" => Ok(Privilege::Execute),
            "CREATE_VOLUME" => Ok(Privilege::CreateVolume),
            "READ_VOLUME" => Ok(Privilege::ReadVolume),
            "CREATE_MODEL" => Ok(Privilege::CreateModel),
            "CREATE_EXTERNAL_LOCATION" => Ok(Privilege::CreateExternalLocation),
            "READ_FILES" => Ok(Privilege::ReadFiles),
            "WRITE_FILES" => Ok(Privilege::WriteFiles),
            "CREATE_EXTERNAL_TABLE" => Ok(Privilege::CreateExternalTable),
            "CREATE_EXTERNAL_VOLUME" => Ok(Privilege::CreateExternalVolume),
            "CREATE_MANAGED_STORAGE" => Ok(Privilege::CreateManagedStorage),
            "CREATE_STORAGE_CREDENTIAL" => Ok(Privilege::CreateStorageCredential),
            other => Err(format!("unknown privilege: {}", other)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SecurableType {
    Metastore,
    Catalog,
    Schema,
    Table,
    Volume,
    Function,
    RegisteredModel,
}

impl SecurableType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SecurableType::Metastore => "METASTORE",
            SecurableType::Catalog => "CATALOG",
            SecurableType::Schema => "SCHEMA",
            SecurableType::Table => "TABLE",
            SecurableType::Volume => "VOLUME",
            SecurableType::Function => "FUNCTION",
            SecurableType::RegisteredModel => "REGISTERED_MODEL",
        }
    }
}

impl std::fmt::Display for SecurableType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for SecurableType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "METASTORE" => Ok(SecurableType::Metastore),
            "CATALOG" => Ok(SecurableType::Catalog),
            "SCHEMA" => Ok(SecurableType::Schema),
            "TABLE" => Ok(SecurableType::Table),
            "VOLUME" => Ok(SecurableType::Volume),
            "FUNCTION" => Ok(SecurableType::Function),
            "REGISTERED_MODEL" => Ok(SecurableType::RegisteredModel),
            other => Err(format!("unknown securable type: {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivilegeAssignment {
    pub principal: String,
    pub privileges: Vec<Privilege>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionsList {
    pub privilege_assignments: Vec<PrivilegeAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionsChange {
    pub principal: String,
    #[serde(default)]
    pub add: Vec<Privilege>,
    #[serde(default)]
    pub remove: Vec<Privilege>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePermissions {
    pub changes: Vec<PermissionsChange>,
}
