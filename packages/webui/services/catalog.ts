import { getServerSession } from "@/lib/auth"
import {
  type Catalog,
  CatalogApiError,
  type PermissionsResponse,
  type RegisteredModelSummary,
  type ResourceType,
  type Schema,
  type TableDetail,
  type TableSummary,
  type VolumeDetail,
  type VolumeSummary,
} from "@/services/catalog-types"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000"

function getPermissionsPath(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string,
) {
  if (resourceType === "catalog") {
    return `/permissions/catalog/${encodeURIComponent(catalog)}`
  }
  if (resourceType === "schema" && schema) {
    return `/permissions/schema/${encodeURIComponent(`${catalog}.${schema}`)}`
  }
  if (resourceType === "table" && schema && table) {
    return `/permissions/table/${encodeURIComponent(`${catalog}.${schema}.${table}`)}`
  }

  throw new CatalogApiError("Invalid request", 400)
}

async function getAuthToken() {
  const session = await getServerSession()
  return session?.idToken
}

async function ucFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken()
  const headers: Record<string, string> = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (init?.body) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(`${API_BASE}/uc${path}`, {
    cache: "no-store",
    headers,
    ...init,
  })

  if (!res.ok) {
    throw new CatalogApiError(await res.text(), res.status)
  }

  return (await res.json()) as T
}

export async function getCatalogs() {
  return ucFetch<{ catalogs: Catalog[] }>("/catalogs")
}

export async function getSchemas(catalog: string) {
  return ucFetch<{ schemas: Schema[] }>(
    `/schemas?catalog_name=${catalog}&max_results=200`,
  )
}

export async function getTables(catalog: string, schema: string) {
  return ucFetch<{ tables: TableSummary[] }>(
    `/tables?catalog_name=${catalog}&schema_name=${schema}&max_results=200`,
  )
}

export async function getTable(catalog: string, schema: string, table: string) {
  return ucFetch<TableDetail>(`/tables/${catalog}.${schema}.${table}`)
}

export async function getVolumes(catalog: string, schema: string) {
  return ucFetch<{ volumes: VolumeSummary[] }>(
    `/volumes?catalog_name=${catalog}&schema_name=${schema}&max_results=200`,
  )
}

export async function getVolume(
  catalog: string,
  schema: string,
  volume: string,
) {
  return ucFetch<VolumeDetail>(`/volumes/${catalog}.${schema}.${volume}`)
}

export async function getModels(catalog: string, schema: string) {
  return ucFetch<{ registered_models: RegisteredModelSummary[] }>(
    `/models?catalog_name=${catalog}&schema_name=${schema}&max_results=200`,
  )
}

export async function getPermissions(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string,
) {
  return ucFetch<PermissionsResponse>(
    getPermissionsPath(resourceType, catalog, schema, table),
  )
}

export async function getEffectivePrivileges(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string,
): Promise<string[]> {
  const path = getPermissionsPath(resourceType, catalog, schema, table).replace(
    "/permissions/",
    "/effective-permissions/",
  )
  const data = await ucFetch<{ privileges: string[] }>(path)
  return data.privileges
}

export async function patchPermissions(input: {
  resourceType: ResourceType
  catalog: string
  schema?: string
  table?: string
  principal: string
  add: string[]
  remove: string[]
}) {
  return ucFetch<PermissionsResponse>(
    getPermissionsPath(
      input.resourceType,
      input.catalog,
      input.schema,
      input.table,
    ),
    {
      method: "PATCH",
      body: JSON.stringify({
        changes: [
          {
            principal: input.principal,
            add: input.add,
            remove: input.remove,
          },
        ],
      }),
    },
  )
}
