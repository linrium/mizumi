FROM quay.io/keycloak/keycloak:26.3.3 AS builder
ENV KC_HEALTH_ENABLED=true \
    KC_TRACING_ENABLED=true \
    KC_TRACING_SAMPLER_TYPE=traceidratio \
    KC_METRICS_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build \
  --db=postgres \
  --features=opentelemetry \
  --tracing-enabled=true \
  --tracing-sampler-type=traceidratio \
  --metrics-enabled=true

FROM quay.io/keycloak/keycloak:26.3.3
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
