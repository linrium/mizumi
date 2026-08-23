#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

RELEASE=${RELEASE:-rustfs}
NAMESPACE=${NAMESPACE:-storage}
CHART=${CHART:-rustfs/rustfs}
CHART_VERSION=${CHART_VERSION:-0.10.0}
SECRET_NAME=${SECRET_NAME:-rustfs-auth}
OIDC_SECRET_NAME=${OIDC_SECRET_NAME:-rustfs-oidc-keycloak}

KEYCLOAK_NAMESPACE=${KEYCLOAK_NAMESPACE:-keycloak}
KEYCLOAK_POD=${KEYCLOAK_POD:-keycloak-0}
KEYCLOAK_REALM=${KEYCLOAK_REALM:-master}
KEYCLOAK_HOSTNAME=${KEYCLOAK_HOSTNAME:-keycloak-service.keycloak.svc.cluster.local}
KEYCLOAK_SERVICE=${KEYCLOAK_SERVICE:-keycloak-service}
KEYCLOAK_TLS_SECRET=${KEYCLOAK_TLS_SECRET:-keycloak-tls}
KEYCLOAK_OIDC_CLIENT_ID=${KEYCLOAK_OIDC_CLIENT_ID:-rustfs}
KEYCLOAK_OIDC_CLIENT_SECRET=${KEYCLOAK_OIDC_CLIENT_SECRET:-rustfs-dev-secret}
KEYCLOAK_ADMIN_USERNAME=${KEYCLOAK_ADMIN_USERNAME:-admin}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}

RUSTFS_PUBLIC_URL=${RUSTFS_PUBLIC_URL:-http://127.0.0.1:9001}
RUSTFS_OIDC_DISPLAY_NAME=${RUSTFS_OIDC_DISPLAY_NAME:-Keycloak}
RUSTFS_OIDC_SCOPES=${RUSTFS_OIDC_SCOPES:-openid,profile,email}
RUSTFS_OIDC_ROLE_POLICY=${RUSTFS_OIDC_ROLE_POLICY:-consoleAdmin}
RUSTFS_OIDC_CLAIM_NAME=${RUSTFS_OIDC_CLAIM_NAME:-groups}
RUSTFS_OIDC_GROUPS_CLAIM=${RUSTFS_OIDC_GROUPS_CLAIM:-groups}
RUSTFS_OIDC_USERNAME_CLAIM=${RUSTFS_OIDC_USERNAME_CLAIM:-preferred_username}
RUSTFS_OIDC_EMAIL_CLAIM=${RUSTFS_OIDC_EMAIL_CLAIM:-email}
RUSTFS_OIDC_REDIRECT_URI_DYNAMIC=${RUSTFS_OIDC_REDIRECT_URI_DYNAMIC:-on}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd helm
require_cmd kubectl

keycloak_url="https://$KEYCLOAK_HOSTNAME:8443"
issuer_url="$keycloak_url/realms/$KEYCLOAK_REALM"
config_url="$issuer_url/.well-known/openid-configuration"
rustfs_console_localhost="http://localhost:9001"
rustfs_console_127="http://127.0.0.1:9001"
rustfs_api_localhost="http://localhost:9000"
rustfs_api_127="http://127.0.0.1:9000"
rustfs_console_service="http://$RELEASE-svc.$NAMESPACE.svc:9001"
rustfs_console_service_fqdn="http://$RELEASE-svc.$NAMESPACE.svc.cluster.local:9001"
rustfs_api_service="http://$RELEASE-svc.$NAMESPACE.svc:9000"
rustfs_api_service_fqdn="http://$RELEASE-svc.$NAMESPACE.svc.cluster.local:9000"

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

if ! kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" >/dev/null 2>&1; then
  access_key=${RUSTFS_ACCESS_KEY:-admin}
  secret_key=${RUSTFS_SECRET_KEY:-adminadmin}

  kubectl -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
    --from-literal=RUSTFS_ACCESS_KEY="$access_key" \
    --from-literal=RUSTFS_SECRET_KEY="$secret_key"
fi

kubectl -n "$KEYCLOAK_NAMESPACE" exec "$KEYCLOAK_POD" -- \
  keytool -importcert -noprompt \
    -alias keycloak-local \
    -file /mnt/certificates/tls.crt \
    -keystore /tmp/keycloak-local-truststore.p12 \
    -storetype PKCS12 \
    -storepass changeit >/dev/null 2>&1 || true

kubectl -n "$KEYCLOAK_NAMESPACE" exec "$KEYCLOAK_POD" -- \
  /opt/keycloak/bin/kcadm.sh config credentials \
    --server https://127.0.0.1:8443 \
    --realm master \
    --user "$KEYCLOAK_ADMIN_USERNAME" \
    --password "$KEYCLOAK_ADMIN_PASSWORD" \
    --truststore /tmp/keycloak-local-truststore.p12 \
    --trustpass changeit >/dev/null

client_uuid=$(kubectl -n "$KEYCLOAK_NAMESPACE" exec "$KEYCLOAK_POD" -- sh -c "
  export KC_OPTS='-Djavax.net.ssl.trustStore=/tmp/keycloak-local-truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit -Djavax.net.ssl.trustStoreType=PKCS12'
  /opt/keycloak/bin/kcadm.sh get clients -r '$KEYCLOAK_REALM' -q clientId='$KEYCLOAK_OIDC_CLIENT_ID' --fields id | sed -n 's/.*\"id\" : \"\\([^\"]*\\)\".*/\\1/p'
")

if [ -z "$client_uuid" ]; then
  kubectl -n "$KEYCLOAK_NAMESPACE" exec "$KEYCLOAK_POD" -- sh -c "
    export KC_OPTS='-Djavax.net.ssl.trustStore=/tmp/keycloak-local-truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit -Djavax.net.ssl.trustStoreType=PKCS12'
    /opt/keycloak/bin/kcadm.sh create clients -r '$KEYCLOAK_REALM' \
      -s clientId='$KEYCLOAK_OIDC_CLIENT_ID' \
      -s name='RustFS' \
      -s enabled=true \
      -s protocol=openid-connect \
      -s publicClient=false \
      -s clientAuthenticatorType=client-secret \
      -s standardFlowEnabled=true \
      -s directAccessGrantsEnabled=false \
      -s serviceAccountsEnabled=false
  " >/dev/null
  client_uuid=$(kubectl -n "$KEYCLOAK_NAMESPACE" exec "$KEYCLOAK_POD" -- sh -c "
    export KC_OPTS='-Djavax.net.ssl.trustStore=/tmp/keycloak-local-truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit -Djavax.net.ssl.trustStoreType=PKCS12'
    /opt/keycloak/bin/kcadm.sh get clients -r '$KEYCLOAK_REALM' -q clientId='$KEYCLOAK_OIDC_CLIENT_ID' --fields id | sed -n 's/.*\"id\" : \"\\([^\"]*\\)\".*/\\1/p'
  ")
fi

kubectl -n "$KEYCLOAK_NAMESPACE" exec "$KEYCLOAK_POD" -- sh -c "
  export KC_OPTS='-Djavax.net.ssl.trustStore=/tmp/keycloak-local-truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit -Djavax.net.ssl.trustStoreType=PKCS12'
  cat >/tmp/rustfs-client.json <<EOF
{
  \"clientId\": \"$KEYCLOAK_OIDC_CLIENT_ID\",
  \"name\": \"RustFS\",
  \"enabled\": true,
  \"protocol\": \"openid-connect\",
  \"publicClient\": false,
  \"clientAuthenticatorType\": \"client-secret\",
  \"secret\": \"$KEYCLOAK_OIDC_CLIENT_SECRET\",
  \"standardFlowEnabled\": true,
  \"directAccessGrantsEnabled\": false,
  \"serviceAccountsEnabled\": false,
  \"redirectUris\": [
    \"$RUSTFS_PUBLIC_URL/*\",
    \"$rustfs_console_localhost/*\",
    \"$rustfs_console_127/*\",
    \"$rustfs_api_localhost/*\",
    \"$rustfs_api_127/*\",
    \"$rustfs_console_service/*\",
    \"$rustfs_console_service_fqdn/*\",
    \"$rustfs_api_service/*\",
    \"$rustfs_api_service_fqdn/*\"
  ],
  \"webOrigins\": [
    \"$RUSTFS_PUBLIC_URL\",
    \"$rustfs_console_localhost\",
    \"$rustfs_console_127\",
    \"$rustfs_api_localhost\",
    \"$rustfs_api_127\",
    \"$rustfs_console_service\",
    \"$rustfs_console_service_fqdn\",
    \"$rustfs_api_service\",
    \"$rustfs_api_service_fqdn\"
  ]
}
EOF
  /opt/keycloak/bin/kcadm.sh update clients/$client_uuid -r '$KEYCLOAK_REALM' -f /tmp/rustfs-client.json
" >/dev/null

tmp_cert=$(mktemp)
tmp_values=$(mktemp)
trap 'rm -f "$tmp_cert" "$tmp_values"' EXIT HUP INT TERM

kubectl -n "$KEYCLOAK_NAMESPACE" get secret "$KEYCLOAK_TLS_SECRET" -o jsonpath='{.data.tls\.crt}' \
  | base64 -d >"$tmp_cert"

kubectl -n "$NAMESPACE" create secret generic "$OIDC_SECRET_NAME" \
  --from-literal=RUSTFS_IDENTITY_OPENID_CLIENT_SECRET="$KEYCLOAK_OIDC_CLIENT_SECRET" \
  --from-file=keycloak-tls.crt="$tmp_cert" \
  --dry-run=client -o yaml | kubectl apply -f -


cat >"$tmp_values" <<EOF
extraEnv:
  - name: RUSTFS_IDENTITY_OPENID_ENABLE
    value: "on"
  - name: RUSTFS_IDENTITY_OPENID_CONFIG_URL
    value: "$config_url"
  - name: RUSTFS_IDENTITY_OPENID_CLIENT_ID
    value: "$KEYCLOAK_OIDC_CLIENT_ID"
  - name: RUSTFS_IDENTITY_OPENID_CLIENT_SECRET
    valueFrom:
      secretKeyRef:
        name: "$OIDC_SECRET_NAME"
        key: RUSTFS_IDENTITY_OPENID_CLIENT_SECRET
  - name: RUSTFS_IDENTITY_OPENID_SCOPES
    value: "$RUSTFS_OIDC_SCOPES"
  - name: RUSTFS_IDENTITY_OPENID_DISPLAY_NAME
    value: "$RUSTFS_OIDC_DISPLAY_NAME"
  - name: RUSTFS_IDENTITY_OPENID_ROLE_POLICY
    value: "$RUSTFS_OIDC_ROLE_POLICY"
  - name: RUSTFS_IDENTITY_OPENID_CLAIM_NAME
    value: "$RUSTFS_OIDC_CLAIM_NAME"
  - name: RUSTFS_IDENTITY_OPENID_GROUPS_CLAIM
    value: "$RUSTFS_OIDC_GROUPS_CLAIM"
  - name: RUSTFS_IDENTITY_OPENID_USERNAME_CLAIM
    value: "$RUSTFS_OIDC_USERNAME_CLAIM"
  - name: RUSTFS_IDENTITY_OPENID_EMAIL_CLAIM
    value: "$RUSTFS_OIDC_EMAIL_CLAIM"
  - name: RUSTFS_IDENTITY_OPENID_REDIRECT_URI_DYNAMIC
    value: "$RUSTFS_OIDC_REDIRECT_URI_DYNAMIC"
  - name: SSL_CERT_FILE
    value: /etc/rustfs/oidc/keycloak-tls.crt
extraVolumes:
  - name: rustfs-oidc-keycloak-tls
    secret:
      secretName: "$OIDC_SECRET_NAME"
      items:
        - key: keycloak-tls.crt
          path: keycloak-tls.crt
extraVolumeMounts:
  - name: rustfs-oidc-keycloak-tls
    mountPath: /etc/rustfs/oidc
    readOnly: true
EOF

helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --version "$CHART_VERSION" \
  -f "$APP_DIR/values.yaml" \
  -f "$tmp_values"

kubectl -n "$NAMESPACE" rollout restart deployment/"$RELEASE"
kubectl -n "$NAMESPACE" rollout status deployment/"$RELEASE"

cat <<EOF
RustFS OIDC with Keycloak is configured.

RustFS:
  release:      $RELEASE
  namespace:    $NAMESPACE
  public URL:   $RUSTFS_PUBLIC_URL
  role policy:  $RUSTFS_OIDC_ROLE_POLICY
  secret ref:   secret/$OIDC_SECRET_NAME

Keycloak:
  issuer:       $issuer_url
  client ID:    $KEYCLOAK_OIDC_CLIENT_ID

Before browser login, forward RustFS and Keycloak:
  kubectl -n $NAMESPACE port-forward svc/$RELEASE-svc 9001:9001
  kubectl -n $KEYCLOAK_NAMESPACE port-forward svc/$KEYCLOAK_SERVICE 8443:8443

If needed, add this local hostname:
  127.0.0.1 $KEYCLOAK_HOSTNAME
EOF
