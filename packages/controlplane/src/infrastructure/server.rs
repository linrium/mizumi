use std::sync::Arc;

use crate::application::{
    k8s_service::K8sQueryService, streaming_service::StreamingJobService,
    test_event_service::TestEventService,
    uc_service::UnityCatalogProxyService,
};

pub struct AppState {
    pub k8s_service: Arc<K8sQueryService>,
    pub streaming_service: Arc<StreamingJobService>,
    pub test_event_service: Arc<TestEventService>,
    pub uc_service: Arc<UnityCatalogProxyService>,
}
