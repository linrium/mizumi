import { getServerSession } from "@/lib/auth"
import {
  type Catalog,
  CatalogApiError,
  type ModelVersionSummary,
  type PermissionsResponse,
  type RegisteredModelDetail,
  type RegisteredModelSummary,
  type ResourceType,
  type Schema,
  type TableDetail,
  type TableSummary,
  type VolumeDetail,
  type VolumeSummary,
} from "@/services/catalog-types"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000"

function collectionPath(
  resource: string,
  params: Record<string, string | number>
) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value))
  }

  return `/${resource}?${search.toString()}`
}

function namedResourcePath(resource: string, ...parts: string[]) {
  return `/${resource}/${encodeURIComponent(parts.join("."))}`
}

function getPermissionsPath(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string
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

  const url = `${API_BASE}/uc${path}`
  const res = await fetch(url, {
    cache: "no-store",
    headers,
    ...init,
  })

  if (!res.ok) {
    throw new CatalogApiError(
      `Unity Catalog request failed (${res.status}) for /uc${path}: ${await res.text()}`,
      res.status
    )
  }

  return (await res.json()) as T
}

export function getCatalogs() {
  return ucFetch<{ catalogs: Catalog[] }>("/catalogs")
}

export function getSchemas(catalog: string) {
  return ucFetch<{ schemas: Schema[] }>(
    collectionPath("schemas", { catalog_name: catalog, max_results: 200 })
  )
}

export function getTables(catalog: string, schema: string) {
  return ucFetch<{ tables: TableSummary[] }>(
    collectionPath("tables", {
      catalog_name: catalog,
      max_results: 200,
      schema_name: schema,
    })
  )
}

export function getTable(catalog: string, schema: string, table: string) {
  return ucFetch<TableDetail>(
    namedResourcePath("tables", catalog, schema, table)
  )
}

export function getVolumes(catalog: string, schema: string) {
  return ucFetch<{ volumes: VolumeSummary[] }>(
    collectionPath("volumes", {
      catalog_name: catalog,
      max_results: 200,
      schema_name: schema,
    })
  )
}

export function getVolume(catalog: string, schema: string, volume: string) {
  return ucFetch<VolumeDetail>(
    namedResourcePath("volumes", catalog, schema, volume)
  )
}

export function getModels(catalog: string, schema: string) {
  return ucFetch<{ registered_models: RegisteredModelSummary[] }>(
    collectionPath("models", {
      catalog_name: catalog,
      max_results: 200,
      schema_name: schema,
    })
  )
}

export function getModel(catalog: string, schema: string, model: string) {
  return ucFetch<RegisteredModelDetail>(
    namedResourcePath("models", catalog, schema, model)
  )
}

export function getModelVersions(
  catalog: string,
  schema: string,
  model: string
) {
  return ucFetch<{ model_versions?: ModelVersionSummary[] }>(
    `${namedResourcePath("models", catalog, schema, model)}/versions?${new URLSearchParams({ max_results: "200" }).toString()}`
  )
}

export function getPermissions(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string
) {
  return ucFetch<PermissionsResponse>(
    getPermissionsPath(resourceType, catalog, schema, table)
  )
}

export async function getEffectivePrivileges(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string
): Promise<string[]> {
  const path = getPermissionsPath(resourceType, catalog, schema, table).replace(
    "/permissions/",
    "/effective-permissions/"
  )
  const data = await ucFetch<{ privileges: string[] }>(path)
  return data.privileges
}

export function patchPermissions(input: {
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
      input.table
    ),
    {
      body: JSON.stringify({
        changes: [
          {
            add: input.add,
            principal: input.principal,
            remove: input.remove,
          },
        ],
      }),
      method: "PATCH",
    }
  )
}
