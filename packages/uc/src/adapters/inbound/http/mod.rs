pub mod auth;
pub mod error;
pub mod catalog;
pub mod schema;
pub mod table;
pub mod volume;
pub mod function;
pub mod model;
pub mod metastore;
pub mod middleware;
pub mod permissions;
pub mod user;

use axum::{middleware as axum_middleware, routing::{delete, get, post, put}, Router};
use std::sync::Arc;
use crate::infrastructure::server::AppState;

pub fn create_router(state: Arc<AppState>) -> Router {
    let protected = api_routes()
        .route_layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    // SCIM2 user routes — also protected by auth middleware
    let scim_routes = scim_routes()
        .route_layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    Router::new()
        // Public auth endpoints (no JWT required)
        .route("/auth/login", get(auth::login))
        .route("/auth/callback", get(auth::callback))
        .nest("/api/2.1/unity-catalog", protected)
        .nest("/api/1.0/unity-control", scim_routes)
        .with_state(state)
}

fn scim_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/scim2/Users", post(user::create_user).get(user::list_users))
        .route(
            "/scim2/Users/:id",
            get(user::get_user).put(user::update_user).delete(user::delete_user),
        )
}


fn api_routes() -> Router<Arc<AppState>> {
    Router::new()
        // Catalogs
        .route("/catalogs", post(catalog::create_catalog).get(catalog::list_catalogs))
        .route(
            "/catalogs/:name",
            get(catalog::get_catalog)
                .patch(catalog::update_catalog)
                .delete(catalog::delete_catalog),
        )
        // Schemas
        .route("/schemas", post(schema::create_schema).get(schema::list_schemas))
        .route(
            "/schemas/:full_name",
            get(schema::get_schema)
                .patch(schema::update_schema)
                .delete(schema::delete_schema),
        )
        // Tables
        .route("/tables", post(table::create_table).get(table::list_tables))
        .route(
            "/tables/:full_name",
            get(table::get_table).delete(table::delete_table),
        )
        // Volumes
        .route("/volumes", post(volume::create_volume).get(volume::list_volumes))
        .route(
            "/volumes/:full_name",
            get(volume::get_volume)
                .patch(volume::update_volume)
                .delete(volume::delete_volume),
        )
        // Functions
        .route("/functions", post(function::create_function).get(function::list_functions))
        .route(
            "/functions/:full_name",
            get(function::get_function).delete(function::delete_function),
        )
        // Registered Models
        .route("/models", post(model::create_registered_model).get(model::list_registered_models))
        .route(
            "/models/:full_name",
            get(model::get_registered_model)
                .patch(model::update_registered_model)
                .delete(model::delete_registered_model),
        )
        // Model Versions
        .route(
            "/models/:full_name/versions",
            post(model::create_model_version).get(model::list_model_versions),
        )
        .route(
            "/models/:full_name/versions/:version",
            get(model::get_model_version)
                .patch(model::update_model_version)
                .delete(model::delete_model_version),
        )
        // Metastore
        .route("/metastore_summary", get(metastore::get_metastore_summary))
        // Permissions
        .route(
            "/permissions/:securable_type/:full_name",
            get(permissions::get_permissions).patch(permissions::update_permissions),
        )
}
