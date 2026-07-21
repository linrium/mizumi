use axum::{Json, response::Html};
use serde_json::{Map, Value, json};

pub async fn openapi_json() -> Json<Value> {
    Json(openapi_spec())
}

pub async fn scalar_docs() -> Html<String> {
    let configuration = json!({
        "url": "/openapi.json",
        "title": "Mizuumi Controlplane API",
        "layout": "modern",
        "theme": "default",
        "agent": { "disabled": true }
    });

    Html(scalar_api_reference::scalar_html_default(&configuration))
}

fn openapi_spec() -> Value {
    json!({
        "openapi": "3.1.0",
        "info": {
            "title": "Mizuumi Controlplane API",
            "version": env!("CARGO_PKG_VERSION"),
            "description": "Kubernetes-native controlplane API for query sessions, streaming jobs, governance workflows, lineage, Dagster, Unity Catalog, and MLflow proxying."
        },
        "servers": [
            { "url": "/" }
        ],
        "tags": [
            { "name": "Health" },
            { "name": "Chat" },
            { "name": "Teams" },
            { "name": "Users" },
            { "name": "Query" },
            { "name": "Tests" },
            { "name": "Streaming" },
            { "name": "Permissions" },
            { "name": "Lineage" },
            { "name": "Dagster" },
            { "name": "Unity Catalog" },
            { "name": "MLflow" }
        ],
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT"
                }
            },
            "schemas": schemas()
        },
        "paths": paths()
    })
}

fn paths() -> Value {
    let mut paths = Map::new();

    public_get(&mut paths, "/livez", "Health", "Liveness probe");
    public_get(&mut paths, "/readyz", "Health", "Readiness probe");

    path(
        &mut paths,
        "/api/chat/threads",
        vec![
            ("get", op("Chat", "List chat threads", None)),
            (
                "post",
                op(
                    "Chat",
                    "Create a chat thread",
                    Some(ref_schema("CreateChatThreadBody")),
                ),
            ),
        ],
    );
    path(
        &mut paths,
        "/api/chat/threads/{id}",
        vec![
            ("get", op("Chat", "Get a chat thread", None)),
            (
                "patch",
                op(
                    "Chat",
                    "Update a chat thread",
                    Some(ref_schema("UpdateChatThreadBody")),
                ),
            ),
            ("delete", op("Chat", "Delete a chat thread", None)),
        ],
    );

    path(
        &mut paths,
        "/api/teams",
        vec![
            ("get", op("Teams", "List teams", None)),
            (
                "post",
                op("Teams", "Create a team", Some(ref_schema("CreateTeamBody"))),
            ),
        ],
    );
    path(
        &mut paths,
        "/api/teams/{id}",
        vec![("get", op("Teams", "Get a team", None))],
    );
    path(
        &mut paths,
        "/api/teams/{id}/members",
        vec![
            ("get", op("Teams", "List team members", None)),
            (
                "post",
                op(
                    "Teams",
                    "Add a team member",
                    Some(ref_schema("AddMemberBody")),
                ),
            ),
        ],
    );
    path(
        &mut paths,
        "/api/teams/{id}/members/{user_id}",
        vec![("delete", op("Teams", "Remove a team member", None))],
    );

    path(
        &mut paths,
        "/api/users",
        vec![("get", op("Users", "List users", None))],
    );
    path(
        &mut paths,
        "/api/users/me",
        vec![("get", op("Users", "Get the current user", None))],
    );
    path(
        &mut paths,
        "/api/users/me/teams",
        vec![("get", op("Users", "List current user's teams", None))],
    );

    path(
        &mut paths,
        "/api/query",
        vec![(
            "post",
            op(
                "Query",
                "Run an ad hoc SQL query",
                Some(ref_schema("QueryRequest")),
            ),
        )],
    );
    path(
        &mut paths,
        "/api/sessions",
        vec![
            ("get", op("Query", "List query sessions", None)),
            ("post", op("Query", "Create a query session", None)),
        ],
    );
    path(
        &mut paths,
        "/api/sessions/{id}",
        vec![("delete", op("Query", "Delete a query session", None))],
    );
    path(
        &mut paths,
        "/api/sessions/{id}/query",
        vec![(
            "post",
            op(
                "Query",
                "Run SQL in a query session",
                Some(ref_schema("QueryRequest")),
            ),
        )],
    );

    for dataset in [
        "hdbank/customers",
        "hdbank/banking-transactions",
        "vietjetair/customers",
        "vietjetair/flight-tickets",
        "vietjetair/flight-incidents",
    ] {
        path(
            &mut paths,
            &format!("/api/tests/{dataset}/batch"),
            vec![(
                "post",
                op(
                    "Tests",
                    "Publish a batch of synthetic test events",
                    Some(any_object()),
                ),
            )],
        );
    }

    path(
        &mut paths,
        "/api/streaming/jobs",
        vec![
            ("get", op("Streaming", "List streaming jobs", None)),
            (
                "post",
                op(
                    "Streaming",
                    "Create a streaming job",
                    Some(ref_schema("CreateStreamingJobRequest")),
                ),
            ),
        ],
    );
    path(
        &mut paths,
        "/api/streaming/jobs/{id}",
        vec![
            ("get", op("Streaming", "Get a streaming job", None)),
            ("delete", op("Streaming", "Delete a streaming job", None)),
        ],
    );
    path(
        &mut paths,
        "/api/streaming/jobs/{id}/logs",
        vec![("get", op("Streaming", "Get streaming job logs", None))],
    );
    path(
        &mut paths,
        "/api/streaming/jobs/{id}/restart",
        vec![("post", op("Streaming", "Restart a streaming job", None))],
    );

    path(
        &mut paths,
        "/api/permissions/requests",
        vec![
            ("get", op("Permissions", "List permission requests", None)),
            (
                "post",
                op(
                    "Permissions",
                    "Create a permission request",
                    Some(ref_schema("CreatePermissionRequest")),
                ),
            ),
        ],
    );
    path(
        &mut paths,
        "/api/permissions/requests/bulk-approve",
        vec![(
            "post",
            op(
                "Permissions",
                "Bulk approve permission requests",
                Some(ref_schema("BulkApproveBody")),
            ),
        )],
    );
    path(
        &mut paths,
        "/api/permissions/requests/{id}",
        vec![
            ("get", op("Permissions", "Get a permission request", None)),
            (
                "patch",
                op(
                    "Permissions",
                    "Update a permission request status",
                    Some(ref_schema("UpdateRequestStatusBody")),
                ),
            ),
        ],
    );
    path(
        &mut paths,
        "/api/permissions/requests/{id}/blast-radius",
        vec![("get", op("Permissions", "Get request blast radius", None))],
    );
    path(
        &mut paths,
        "/api/permissions/policy-templates",
        vec![("get", op("Permissions", "List policy templates", None))],
    );
    path(
        &mut paths,
        "/api/permissions/blast-radius",
        vec![("get", op("Permissions", "List blast radius previews", None))],
    );
    path(
        &mut paths,
        "/api/permissions/grants",
        vec![("get", op("Permissions", "List time-bound grants", None))],
    );
    path(
        &mut paths,
        "/api/permissions/grants/{id}",
        vec![("get", op("Permissions", "Get a time-bound grant", None))],
    );
    path(
        &mut paths,
        "/api/permissions/grants/{id}/revoke",
        vec![(
            "post",
            op(
                "Permissions",
                "Revoke a time-bound grant",
                Some(ref_schema("RevokeGrantBody")),
            ),
        )],
    );
    path(
        &mut paths,
        "/api/permissions/grants/{id}/renew",
        vec![(
            "post",
            op(
                "Permissions",
                "Renew a time-bound grant",
                Some(ref_schema("AdminRenewGrantBody")),
            ),
        )],
    );

    path(
        &mut paths,
        "/api/lineage/rebuild",
        vec![("post", op("Lineage", "Rebuild the lineage graph", None))],
    );
    path(
        &mut paths,
        "/api/lineage/search",
        vec![("get", op("Lineage", "Search lineage nodes", None))],
    );
    path(
        &mut paths,
        "/api/lineage/nodes/{token}",
        vec![("get", op("Lineage", "Get a lineage node", None))],
    );
    path(
        &mut paths,
        "/api/lineage/graph",
        vec![("get", op("Lineage", "Get the lineage graph", None))],
    );
    path(
        &mut paths,
        "/api/lineage/blast-radius",
        vec![("get", op("Lineage", "Get lineage blast radius", None))],
    );

    for (route, summary) in [
        ("/dagster/assets", "List Dagster assets"),
        ("/dagster/asset-nodes", "List Dagster asset nodes"),
        ("/dagster/asset-nodes/{path}", "Get a Dagster asset node"),
        ("/dagster/asset-status/{path}", "Get Dagster asset status"),
        ("/dagster/jobs", "List Dagster jobs"),
        ("/dagster/schedules", "List Dagster schedules"),
        (
            "/dagster/schedule-assets",
            "List Dagster schedule asset selections",
        ),
        (
            "/dagster/schedule-assets/{name}",
            "Get a Dagster schedule asset selection",
        ),
        (
            "/dagster/schedules/{name}/ticks",
            "Get Dagster schedule tick history",
        ),
    ] {
        path(
            &mut paths,
            route,
            vec![("get", op("Dagster", summary, None))],
        );
    }
    path(
        &mut paths,
        "/dagster/materialize/{path}",
        vec![("post", op("Dagster", "Materialize a Dagster asset", None))],
    );
    path(
        &mut paths,
        "/dagster/materialize-many",
        vec![(
            "post",
            op(
                "Dagster",
                "Materialize multiple Dagster assets",
                Some(ref_schema("MaterializeManyRequest")),
            ),
        )],
    );
    path(
        &mut paths,
        "/dagster/runs",
        vec![
            ("get", op("Dagster", "List Dagster runs", None)),
            (
                "post",
                op(
                    "Dagster",
                    "Launch a Dagster run",
                    Some(ref_schema("LaunchRunRequest")),
                ),
            ),
        ],
    );
    path(
        &mut paths,
        "/dagster/runs/{run_id}",
        vec![
            ("get", op("Dagster", "Get a Dagster run", None)),
            ("delete", op("Dagster", "Terminate a Dagster run", None)),
        ],
    );
    path(
        &mut paths,
        "/dagster/runs/{run_id}/events",
        vec![("get", op("Dagster", "Get Dagster run events", None))],
    );

    proxy_path(&mut paths, "/uc/{path}", "Unity Catalog");
    proxy_path(&mut paths, "/mlflow/{path}", "MLflow");

    Value::Object(paths)
}

fn public_get(paths: &mut Map<String, Value>, route: &str, tag: &str, summary: &str) {
    let mut item = Map::new();
    item.insert(
        "get".to_string(),
        json!({
            "tags": [tag],
            "summary": summary,
            "responses": {
                "200": { "description": "OK" }
            }
        }),
    );
    paths.insert(route.to_string(), Value::Object(item));
}

fn path(paths: &mut Map<String, Value>, route: &str, operations: Vec<(&str, Value)>) {
    let mut item = Map::new();
    let parameters = path_parameters(route);
    if !parameters.is_empty() {
        item.insert("parameters".to_string(), Value::Array(parameters));
    }
    for (method, operation) in operations {
        item.insert(method.to_string(), operation);
    }
    paths.insert(route.to_string(), Value::Object(item));
}

fn proxy_path(paths: &mut Map<String, Value>, route: &str, tag: &str) {
    let mut item = Map::new();
    item.insert(
        "parameters".to_string(),
        Value::Array(path_parameters(route)),
    );
    for method in ["get", "post", "put", "patch", "delete"] {
        item.insert(
            method.to_string(),
            op(tag, "Proxy upstream API request", Some(any_object())),
        );
    }
    paths.insert(route.to_string(), Value::Object(item));
}

fn path_parameters(route: &str) -> Vec<Value> {
    route
        .split('/')
        .filter_map(|segment| {
            let name = segment.strip_prefix('{')?.strip_suffix('}')?;
            Some(json!({
                "name": name,
                "in": "path",
                "required": true,
                "schema": { "type": "string" }
            }))
        })
        .collect()
}

fn op(tag: &str, summary: &str, request_schema: Option<Value>) -> Value {
    let mut operation = json!({
        "tags": [tag],
        "summary": summary,
        "security": [{ "bearerAuth": [] }],
        "responses": {
            "200": {
                "description": "Successful response",
                "content": {
                    "application/json": {
                        "schema": any_object()
                    }
                }
            },
            "201": { "description": "Created" },
            "204": { "description": "No content" },
            "400": { "description": "Bad request" },
            "401": { "description": "Unauthorized" },
            "404": { "description": "Not found" },
            "500": { "description": "Internal server error" }
        }
    });

    if let Some(schema) = request_schema {
        operation["requestBody"] = json!({
            "required": true,
            "content": {
                "application/json": {
                    "schema": schema
                }
            }
        });
    }

    operation
}

fn schemas() -> Value {
    json!({
        "QueryRequest": {
            "type": "object",
            "required": ["sql"],
            "properties": {
                "sql": { "type": "string" },
                "idToken": { "type": "string" }
            }
        },
        "CreateStreamingJobRequest": {
            "type": "object",
            "required": ["name", "image", "main_application_file"],
            "properties": {
                "name": { "type": "string" },
                "namespace": { "type": "string" },
                "image": { "type": "string" },
                "main_application_file": { "type": "string" },
                "spark_version": { "type": "string" },
                "spark_conf": any_object(),
                "driver_cores": { "type": "integer" },
                "driver_memory": { "type": "string" },
                "executor_instances": { "type": "integer" },
                "executor_cores": { "type": "integer" },
                "executor_memory": { "type": "string" }
            }
        },
        "CreatePermissionRequest": {
            "type": "object",
            "required": ["submit_as", "resource", "scope", "privileges", "rationale"],
            "properties": {
                "submit_as": { "type": "string" },
                "team": uuid_schema(),
                "resource": { "type": "string" },
                "scope": { "type": "string" },
                "privileges": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "rationale": { "type": "string" },
                "requested_duration_days": { "type": "integer" },
                "renewal_of": uuid_schema()
            }
        },
        "UpdateRequestStatusBody": any_object(),
        "BulkApproveBody": any_object(),
        "RevokeGrantBody": any_object(),
        "AdminRenewGrantBody": any_object(),
        "CreateChatThreadBody": any_object(),
        "UpdateChatThreadBody": any_object(),
        "CreateTeamBody": any_object(),
        "AddMemberBody": any_object(),
        "MaterializeManyRequest": any_object(),
        "LaunchRunRequest": any_object()
    })
}

fn ref_schema(name: &str) -> Value {
    json!({ "$ref": format!("#/components/schemas/{name}") })
}

fn any_object() -> Value {
    json!({
        "type": "object",
        "additionalProperties": true
    })
}

fn uuid_schema() -> Value {
    json!({
        "type": "string",
        "format": "uuid"
    })
}
