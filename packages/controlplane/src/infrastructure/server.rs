use std::sync::Arc;

use crate::application::{
    dagster_service::DagsterService,
    k8s_service::K8sQueryService, streaming_service::StreamingJobService,
    test_event_service::TestEventService,
    uc_service::UnityCatalogProxyService,
};

pub struct AppState {
    pub dagster_service: Arc<DagsterService>,
    pub k8s_service: Arc<K8sQueryService>,
    pub streaming_service: Arc<StreamingJobService>,
    pub test_event_service: Arc<TestEventService>,
    pub uc_service: Arc<UnityCatalogProxyService>,
}
