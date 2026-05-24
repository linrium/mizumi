#!/usr/bin/env bash
set -euo pipefail

DAGSTER_NAMESPACE="${DAGSTER_NAMESPACE:-shared-postgres}"
PG_SERVICE="${PG_SERVICE:-shared-postgres-svc}"
PG_SECRET_NAME="${PG_SECRET_NAME:-shared-postgres-secret}"
PG_SECRET_KEY="${PG_SECRET_KEY:-}"
PG_PORT="${PG_PORT:-5432}"
PG_STATEFULSET_NAME="${PG_STATEFULSET_NAME:-shared-postgres}"
PG_ADMIN_USER="${PG_ADMIN_USER:-}"
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-}"
DAGSTER_DB="${DAGSTER_DB:-dagster}"
DAGSTER_USER="${DAGSTER_USER:-dagster}"
DAGSTER_PASSWORD="${DAGSTER_PASSWORD:-dagster_password}"
CONTROLPLANE_DB="${CONTROLPLANE_DB:-controlplane}"
CONTROLPLANE_USER="${CONTROLPLANE_USER:-controlplane}"
CONTROLPLANE_PASSWORD="${CONTROLPLANE_PASSWORD:-controlplane_password}"
UC_DB="${UC_DB:-ucdb}"
UC_USER="${UC_USER:-ucuser}"
UC_PASSWORD="${UC_PASSWORD:-ucpassword}"
KEYCLOAK_DB="${KEYCLOAK_DB:-keycloak}"
KEYCLOAK_USER="${KEYCLOAK_USER:-keycloak}"
KEYCLOAK_PASSWORD="${KEYCLOAK_PASSWORD:-keycloak}"
MLFLOW_DB="${MLFLOW_DB:-mlflow}"
MLFLOW_USER="${MLFLOW_USER:-mlflow}"
MLFLOW_PASSWORD="${MLFLOW_PASSWORD:-mlflow_password}"
CLIENT_IMAGE="${CLIENT_IMAGE:-postgres:18}"

kubectl rollout status "statefulset/${PG_STATEFULSET_NAME}" -n "${DAGSTER_NAMESPACE}" --timeout=180s

if [[ -z "${PG_ADMIN_USER}" ]]; then
  PG_ADMIN_USER="$(
    kubectl get statefulset "${PG_STATEFULSET_NAME}" \
      -n "${DAGSTER_NAMESPACE}" \
      -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name=='POSTGRES_USER')].value}" \
      2>/dev/null || true
  )"
fi

if [[ -z "${PG_ADMIN_USER}" ]]; then
  encoded_user="$(
    kubectl get secret "${PG_SECRET_NAME}" \
      -n "${DAGSTER_NAMESPACE}" \
      -o "jsonpath={.data.POSTGRES_USER}" \
      2>/dev/null || true
  )"
  if [[ -n "${encoded_user}" ]]; then
    PG_ADMIN_USER="$(
      python3 -c 'import base64, sys; print(base64.b64decode(sys.stdin.read()).decode(), end="")' \
        <<<"${encoded_user}"
    )"
  fi
fi

if [[ -z "${PG_ADMIN_USER}" ]]; then
  PG_ADMIN_USER="postgres"
fi

if [[ -z "${PG_SECRET_KEY}" ]]; then
  PG_SECRET_NAME_FROM_STS="$(
    kubectl get statefulset "${PG_STATEFULSET_NAME}" \
      -n "${DAGSTER_NAMESPACE}" \
      -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name=='POSTGRES_PASSWORD')].valueFrom.secretKeyRef.name}" \
      2>/dev/null || true
  )"
  if [[ -n "${PG_SECRET_NAME_FROM_STS}" ]]; then
    PG_SECRET_NAME="${PG_SECRET_NAME_FROM_STS}"
  fi

  PG_SECRET_KEY="$(
    kubectl get statefulset "${PG_STATEFULSET_NAME}" \
      -n "${DAGSTER_NAMESPACE}" \
      -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name=='POSTGRES_PASSWORD')].valueFrom.secretKeyRef.key}" \
      2>/dev/null || true
  )"
fi

if [[ -z "${PG_ADMIN_PASSWORD}" ]]; then
  for key in "${PG_SECRET_KEY}" postgresql-password postgres-password postgresql-postgres-password; do
    [[ -z "${key}" ]] && continue
    encoded_password="$(
      kubectl get secret "${PG_SECRET_NAME}" \
        -n "${DAGSTER_NAMESPACE}" \
        -o "jsonpath={.data.${key}}" \
        2>/dev/null || true
    )"
    if [[ -n "${encoded_password}" ]]; then
      PG_ADMIN_PASSWORD="$(
        python3 -c 'import base64, sys; print(base64.b64decode(sys.stdin.read()).decode(), end="")' \
          <<<"${encoded_password}"
      )"
      break
    fi
  done
fi

if [[ -z "${PG_ADMIN_PASSWORD}" ]]; then
  echo "failed to resolve shared postgres admin password from secret ${PG_SECRET_NAME} in namespace ${DAGSTER_NAMESPACE}" >&2
  echo "set PG_ADMIN_PASSWORD explicitly or redeploy shared postgres with known credentials" >&2
  exit 1
fi

kubectl delete pod shared-postgres-bootstrap -n "${DAGSTER_NAMESPACE}" --ignore-not-found >/dev/null

kubectl run shared-postgres-bootstrap \
  -n "${DAGSTER_NAMESPACE}" \
  --restart=Never \
  --rm \
  --attach \
  --image="${CLIENT_IMAGE}" \
  --env="PGPASSWORD=${PG_ADMIN_PASSWORD}" \
  --command -- /bin/sh -ceu "
    export PGHOST='${PG_SERVICE}'
    export PGPORT='${PG_PORT}'
    export PGUSER='${PG_ADMIN_USER}'

    until pg_isready -h \"\$PGHOST\" -p \"\$PGPORT\" -U \"\$PGUSER\" -d postgres; do
      echo 'waiting for shared postgres...'
      sleep 2
    done

    psql -v ON_ERROR_STOP=1 -h \"\$PGHOST\" -p \"\$PGPORT\" -U \"\$PGUSER\" -d postgres <<'SQL'
SELECT 'CREATE ROLE ${DAGSTER_USER} LOGIN PASSWORD ''${DAGSTER_PASSWORD}'''
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DAGSTER_USER}')\gexec

SELECT 'ALTER ROLE ${DAGSTER_USER} WITH LOGIN PASSWORD ''${DAGSTER_PASSWORD}'''
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DAGSTER_USER}')\gexec

SELECT 'CREATE DATABASE ${DAGSTER_DB} OWNER ${DAGSTER_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DAGSTER_DB}')\gexec

SELECT 'ALTER DATABASE ${DAGSTER_DB} OWNER TO ${DAGSTER_USER}'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${DAGSTER_DB}')\gexec

SELECT 'CREATE ROLE ${CONTROLPLANE_USER} LOGIN PASSWORD ''${CONTROLPLANE_PASSWORD}'''
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${CONTROLPLANE_USER}')\gexec

SELECT 'ALTER ROLE ${CONTROLPLANE_USER} WITH LOGIN PASSWORD ''${CONTROLPLANE_PASSWORD}'''
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${CONTROLPLANE_USER}')\gexec

SELECT 'CREATE DATABASE ${CONTROLPLANE_DB} OWNER ${CONTROLPLANE_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${CONTROLPLANE_DB}')\gexec

SELECT 'ALTER DATABASE ${CONTROLPLANE_DB} OWNER TO ${CONTROLPLANE_USER}'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${CONTROLPLANE_DB}')\gexec

SELECT 'CREATE ROLE ${UC_USER} LOGIN PASSWORD ''${UC_PASSWORD}'''
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${UC_USER}')\gexec

SELECT 'ALTER ROLE ${UC_USER} WITH LOGIN PASSWORD ''${UC_PASSWORD}'''
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${UC_USER}')\gexec

SELECT 'CREATE DATABASE ${UC_DB} OWNER ${UC_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${UC_DB}')\gexec

SELECT 'ALTER DATABASE ${UC_DB} OWNER TO ${UC_USER}'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${UC_DB}')\gexec

SELECT 'CREATE ROLE ${KEYCLOAK_USER} LOGIN PASSWORD ''${KEYCLOAK_PASSWORD}'''
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${KEYCLOAK_USER}')\gexec

SELECT 'ALTER ROLE ${KEYCLOAK_USER} WITH LOGIN PASSWORD ''${KEYCLOAK_PASSWORD}'''
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${KEYCLOAK_USER}')\gexec

SELECT 'CREATE DATABASE ${KEYCLOAK_DB} OWNER ${KEYCLOAK_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${KEYCLOAK_DB}')\gexec

SELECT 'ALTER DATABASE ${KEYCLOAK_DB} OWNER TO ${KEYCLOAK_USER}'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${KEYCLOAK_DB}')\gexec

SELECT 'CREATE ROLE ${MLFLOW_USER} LOGIN PASSWORD ''${MLFLOW_PASSWORD}'''
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${MLFLOW_USER}')\gexec

SELECT 'ALTER ROLE ${MLFLOW_USER} WITH LOGIN PASSWORD ''${MLFLOW_PASSWORD}'''
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${MLFLOW_USER}')\gexec

SELECT 'CREATE DATABASE ${MLFLOW_DB} OWNER ${MLFLOW_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${MLFLOW_DB}')\gexec

SELECT 'ALTER DATABASE ${MLFLOW_DB} OWNER TO ${MLFLOW_USER}'
WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${MLFLOW_DB}')\gexec
SQL
  "
