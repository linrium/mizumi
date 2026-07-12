use std::{env, sync::OnceLock, time::Instant};

use axum::{
    Router,
    extract::{MatchedPath, Request},
    http::StatusCode,
    middleware,
    middleware::Next,
    response::Response,
};
use opentelemetry::{
    KeyValue, global,
    metrics::{Counter, Histogram},
    trace::TracerProvider,
};
use opentelemetry_otlp::{Protocol, WithExportConfig};
use opentelemetry_sdk::{Resource, metrics::SdkMeterProvider, trace::SdkTracerProvider};
use tracing::Span;
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

const SERVICE_NAME: &str = "unitycatalog";
const OTLP_HTTP_ENDPOINT: &str = "http://signoz-ingester.signoz.svc.cluster.local:4318";

pub struct TelemetryGuard {
    tracer_provider: Option<SdkTracerProvider>,
    meter_provider: Option<SdkMeterProvider>,
}

impl TelemetryGuard {
    pub fn shutdown(mut self) {
        if let Some(provider) = self.tracer_provider.take() {
            if let Err(error) = provider.shutdown() {
                eprintln!("failed to shut down OpenTelemetry tracer provider: {error}");
            }
        }

        if let Some(provider) = self.meter_provider.take() {
            if let Err(error) = provider.shutdown() {
                eprintln!("failed to shut down OpenTelemetry meter provider: {error}");
            }
        }
    }
}

pub fn init() -> Result<TelemetryGuard, Box<dyn std::error::Error + Send + Sync>> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into());
    let fmt_layer = tracing_subscriber::fmt::layer();

    if otel_enabled() {
        let resource = Resource::builder()
            .with_service_name(SERVICE_NAME)
            .with_attribute(KeyValue::new("deployment.environment.name", "development"))
            .with_attribute(KeyValue::new("k8s.cluster.name", "mizumi"))
            .with_attribute(KeyValue::new("service.namespace", "unitycatalog"))
            .build();

        let traces_endpoint = signal_endpoint("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "v1/traces");
        let metrics_endpoint = signal_endpoint("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "v1/metrics");

        let span_exporter = opentelemetry_otlp::SpanExporter::builder()
            .with_http()
            .with_endpoint(traces_endpoint)
            .with_protocol(Protocol::HttpBinary)
            .build()?;
        let tracer_provider = SdkTracerProvider::builder()
            .with_resource(resource.clone())
            .with_batch_exporter(span_exporter)
            .build();
        let tracer = tracer_provider.tracer(SERVICE_NAME);
        global::set_tracer_provider(tracer_provider.clone());

        let metric_exporter = opentelemetry_otlp::MetricExporter::builder()
            .with_http()
            .with_endpoint(metrics_endpoint)
            .with_protocol(Protocol::HttpBinary)
            .build()?;
        let meter_provider = SdkMeterProvider::builder()
            .with_resource(resource)
            .with_periodic_exporter(metric_exporter)
            .build();

        global::set_meter_provider(meter_provider.clone());

        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .with(OpenTelemetryLayer::new(tracer))
            .init();

        Ok(TelemetryGuard {
            tracer_provider: Some(tracer_provider),
            meter_provider: Some(meter_provider),
        })
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .init();

        Ok(TelemetryGuard {
            tracer_provider: None,
            meter_provider: None,
        })
    }
}

pub fn layer_router<S>(router: Router<S>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    router
        .layer(middleware::from_fn(record_http_metrics))
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(|req: &Request| {
                    use opentelemetry::propagation::TextMapPropagator;
                    use tracing_opentelemetry::OpenTelemetrySpanExt;

                    let route = route_pattern(req);
                    let propagator = opentelemetry_sdk::propagation::TraceContextPropagator::new();
                    let parent_context = propagator.extract(&HeaderExtractor(req.headers()));

                    let span = tracing::info_span!(
                        "http.server.request",
                        otel.name = %format!("{} {}", req.method(), route),
                        http.request.method = %req.method(),
                        url.path = %req.uri().path(),
                        http.route = %route,
                        http.response.status_code = tracing::field::Empty,
                    );
                    let _ = span.set_parent(parent_context);
                    span
                })
                .on_response(|response: &Response, _latency, span: &Span| {
                    span.record("http.response.status_code", response.status().as_u16());
                }),
        )
}

struct HeaderExtractor<'a>(&'a axum::http::HeaderMap);

impl opentelemetry::propagation::Extractor for HeaderExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|v| v.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0
            .keys()
            .map(|k| k.as_str())
            .collect()
    }
}

pub async fn record_http_metrics(req: Request, next: Next) -> Response {
    let method = req.method().to_string();
    let route = route_pattern(&req);
    let start = Instant::now();
    let response = next.run(req).await;
    let status = response.status();

    let attributes = [
        KeyValue::new("http.request.method", method),
        KeyValue::new("http.route", route),
        KeyValue::new("http.response.status_code", status.as_u16() as i64),
        KeyValue::new("error.type", error_type(status)),
    ];

    http_request_counter().add(1, &attributes);
    http_request_duration().record(start.elapsed().as_secs_f64(), &attributes);

    response
}

fn otel_enabled() -> bool {
    env::var("OTEL_SDK_DISABLED")
        .map(|value| value != "true")
        .unwrap_or(true)
}

fn signal_endpoint(signal_var: &str, signal_path: &str) -> String {
    if let Ok(endpoint) = env::var(signal_var) {
        return endpoint;
    }

    let base = env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| OTLP_HTTP_ENDPOINT.to_string())
        .trim_end_matches('/')
        .to_string();
    format!("{base}/{signal_path}")
}

fn route_pattern(req: &Request) -> String {
    req.extensions()
        .get::<MatchedPath>()
        .map(|matched_path| matched_path.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string())
}

fn error_type(status: StatusCode) -> &'static str {
    if status.is_client_error() {
        "4xx"
    } else if status.is_server_error() {
        "5xx"
    } else {
        "none"
    }
}

fn http_request_counter() -> Counter<u64> {
    static COUNTER: OnceLock<Counter<u64>> = OnceLock::new();

    COUNTER
        .get_or_init(|| {
            global::meter(SERVICE_NAME)
                .u64_counter("http.server.request.count")
                .with_description("Inbound HTTP requests")
                .build()
        })
        .clone()
}

fn http_request_duration() -> Histogram<f64> {
    static HISTOGRAM: OnceLock<Histogram<f64>> = OnceLock::new();

    HISTOGRAM
        .get_or_init(|| {
            global::meter(SERVICE_NAME)
                .f64_histogram("http.server.request.duration")
                .with_description("Inbound HTTP request duration")
                .with_unit("s")
                .build()
        })
        .clone()
}
