use std::sync::Arc;

use crate::application::{
    chat_thread_service::ChatThreadService, dagster_service::DagsterService,
    k8s_service::K8sQueryService, lineage_service::LineageService,
    mlflow_service::MlflowProxyService, permission_service::PermissionService,
    streaming_service::StreamingJobService, team_service::TeamService,
    test_event_service::TestEventService, uc_service::UnityCatalogProxyService,
    user_service::UserService,
};
use crate::infrastructure::auth::KeycloakAuth;

pub struct AppState {
    pub chat_thread_service: Arc<ChatThreadService>,
    pub dagster_service: Arc<DagsterService>,
    pub k8s_service: Arc<K8sQueryService>,
    pub lineage_service: Arc<LineageService>,
    pub mlflow_service: Arc<MlflowProxyService>,
    pub permission_service: Arc<PermissionService>,
    pub streaming_service: Arc<StreamingJobService>,
    pub team_service: Arc<TeamService>,
    pub test_event_service: Arc<TestEventService>,
    pub uc_service: Arc<UnityCatalogProxyService>,
    pub user_service: Arc<UserService>,
    pub keycloak_auth: Arc<KeycloakAuth>,
    pub bypass_token: String,
}
