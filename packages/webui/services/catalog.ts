import { getServerSession } from "@/services/auth"

const API_BASE = "http://localhost:4000"

function getPermissionsPath(
  resourceType: string | null,
  catalog: string | null,
  schema: string | null,
  table: string | null,
) {
  if (resourceType === "catalog" && catalog) {
    return `/permissions/catalog/${encodeURIComponent(catalog)}`
  }
  if (resourceType === "schema" && catalog && schema) {
    return `/permissions/schema/${encodeURIComponent(`${catalog}.${schema}`)}`
  }
  if (resourceType === "table" && catalog && schema && table) {
    return `/permissions/table/${encodeURIComponent(`${catalog}.${schema}.${table}`)}`
  }
  return null
}

async function ucFetch(
  path: string,
  token: string | undefined,
  init?: RequestInit,
) {
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
    return Response.json({ error: await res.text() }, { status: res.status })
  }

  return Response.json(await res.json())
}

export async function handleCatalogGet(request: Request) {
  const session = await getServerSession()
  const token = session?.idToken
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const resourceType = searchParams.get("resourceType")
  const catalog = searchParams.get("catalog")
  const schema = searchParams.get("schema")

  if (type === "catalogs") {
    return ucFetch("/catalogs", token)
  }
  if (type === "schemas" && catalog) {
    return ucFetch(`/schemas?catalog_name=${catalog}&max_results=200`, token)
  }
  if (type === "tables" && catalog && schema) {
    return ucFetch(
      `/tables?catalog_name=${catalog}&schema_name=${schema}&max_results=200`,
      token,
    )
  }
  if (type === "table" && catalog && schema) {
    const table = searchParams.get("table")
    return ucFetch(`/tables/${catalog}.${schema}.${table}`, token)
  }
  if (type === "permissions") {
    const table = searchParams.get("table")
    const path = getPermissionsPath(resourceType, catalog, schema, table)
    if (!path) {
      return Response.json({ error: "Invalid request" }, { status: 400 })
    }
    return ucFetch(path, token)
  }

  return Response.json({ error: "Invalid request" }, { status: 400 })
}

export async function handleCatalogPatch(request: Request) {
  const session = await getServerSession()
  const token = session?.idToken
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const resourceType = searchParams.get("resourceType")
  const catalog = searchParams.get("catalog")
  const schema = searchParams.get("schema")
  const table = searchParams.get("table")
  const path = getPermissionsPath(resourceType, catalog, schema, table)

  if (type !== "permissions" || !path) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }

  return ucFetch(path, token, {
    method: "PATCH",
    body: JSON.stringify(await request.json()),
  })
}
