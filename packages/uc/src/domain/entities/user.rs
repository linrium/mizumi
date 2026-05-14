use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub external_id: Option<String>,
    pub state: UserState,
    pub picture_url: Option<String>,
    pub created_at: i64,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "UPPERCASE")]
#[sqlx(type_name = "varchar", rename_all = "UPPERCASE")]
pub enum UserState {
    Enabled,
    Disabled,
}

impl UserState {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserState::Enabled => "ENABLED",
            UserState::Disabled => "DISABLED",
        }
    }
}

impl std::str::FromStr for UserState {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "ENABLED" => Ok(UserState::Enabled),
            "DISABLED" => Ok(UserState::Disabled),
            other => Err(format!("unknown user state: {}", other)),
        }
    }
}

/// Simplified SCIM2 email object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimEmail {
    pub value: String,
    #[serde(default)]
    pub primary: bool,
}

/// SCIM2 UserResource — used for both request and response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimUser {
    #[serde(default = "default_schemas")]
    pub schemas: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Display name → stored as `name`
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Primary email → used as login identity
    #[serde(rename = "userName", skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    #[serde(default)]
    pub emails: Vec<ScimEmail>,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(rename = "externalId", skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(rename = "meta", skip_serializing_if = "Option::is_none")]
    pub meta: Option<ScimMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScimMeta {
    #[serde(rename = "resourceType")]
    pub resource_type: String,
}

fn default_schemas() -> Vec<String> {
    vec!["urn:ietf:params:scim:schemas:core:2.0:User".to_string()]
}

fn default_active() -> bool {
    true
}

impl ScimUser {
    pub fn primary_email(&self) -> Option<&str> {
        // First try explicit primary, then first in list, then userName
        self.emails
            .iter()
            .find(|e| e.primary)
            .map(|e| e.value.as_str())
            .or_else(|| self.emails.first().map(|e| e.value.as_str()))
            .or(self.user_name.as_deref())
    }
}

impl From<User> for ScimUser {
    fn from(u: User) -> Self {
        ScimUser {
            schemas: default_schemas(),
            id: Some(u.id.to_string()),
            display_name: Some(u.name),
            user_name: Some(u.email.clone()),
            emails: vec![ScimEmail { value: u.email, primary: true }],
            active: u.state == UserState::Enabled,
            external_id: u.external_id,
            meta: Some(ScimMeta { resource_type: "User".to_string() }),
        }
    }
}

/// SCIM2 ListResponse wrapper.
#[derive(Debug, Serialize)]
pub struct ScimListResponse {
    pub schemas: Vec<String>,
    #[serde(rename = "totalResults")]
    pub total_results: usize,
    #[serde(rename = "startIndex")]
    pub start_index: usize,
    #[serde(rename = "itemsPerPage")]
    pub items_per_page: usize,
    #[serde(rename = "Resources")]
    pub resources: Vec<ScimUser>,
}

impl ScimListResponse {
    pub fn new(users: Vec<User>, start_index: usize) -> Self {
        let count = users.len();
        ScimListResponse {
            schemas: vec!["urn:ietf:params:scim:api:messages:2.0:ListResponse".to_string()],
            total_results: count,
            start_index,
            items_per_page: count,
            resources: users.into_iter().map(ScimUser::from).collect(),
        }
    }
}

/// Create user request (simplified, extracted from ScimUser).
#[derive(Debug, Clone)]
pub struct CreateUser {
    pub name: String,
    pub email: String,
    pub external_id: Option<String>,
    pub picture_url: Option<String>,
    pub active: bool,
}

/// Update user request.
#[derive(Debug, Clone)]
pub struct UpdateUser {
    pub name: Option<String>,
    pub active: Option<bool>,
    pub external_id: Option<String>,
}
