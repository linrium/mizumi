import {
  getServerSessionResult,
  getSessionCookieName,
  sessionTtlSeconds,
} from "@/lib/auth/server"

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
  sealedValue?: string | null,
) {
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (init?.body) {
    headers["Content-Type"] = "application/json"
  }
  console.log(`${API_BASE}/uc${path}`)
  const res = await fetch(`${API_BASE}/uc${path}`, {
    cache: "no-store",
    headers,
    ...init,
  })
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")
  if (!res.ok) {
    const text = await res.text()
    const response = Response.json({ error: text }, { status: res.status })
    if (sealedValue) {
      response.headers.append(
        "Set-Cookie",
        `${getSessionCookieName()}=${sealedValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionTtlSeconds}${secure ? "; Secure" : ""}`,
      )
    }
    return response
  }
  const response = Response.json(await res.json())
  if (sealedValue) {
    response.headers.append(
      "Set-Cookie",
      `${getSessionCookieName()}=${sealedValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionTtlSeconds}${secure ? "; Secure" : ""}`,
    )
  }
  return response
}

export async function GET(request: Request) {
  const { session, sealedValue } = await getServerSessionResult()
  const token = session?.idToken ?? undefined
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const resourceType = searchParams.get("resourceType")
  const catalog = searchParams.get("catalog")
  const schema = searchParams.get("schema")

  if (type === "catalogs") {
    return ucFetch("/catalogs", token, undefined, sealedValue)
  }
  if (type === "schemas" && catalog) {
    return ucFetch(
      `/schemas?catalog_name=${catalog}&max_results=200`,
      token,
      undefined,
      sealedValue,
    )
  }
  if (type === "tables" && catalog && schema) {
    return ucFetch(
      `/tables?catalog_name=${catalog}&schema_name=${schema}&max_results=200`,
      token,
      undefined,
      sealedValue,
    )
  }
  if (type === "table" && catalog && schema) {
    const table = searchParams.get("table")
    return ucFetch(
      `/tables/${catalog}.${schema}.${table}`,
      token,
      undefined,
      sealedValue,
    )
  }
  if (type === "permissions") {
    const table = searchParams.get("table")
    const path = getPermissionsPath(resourceType, catalog, schema, table)
    if (!path) {
      return Response.json({ error: "Invalid request" }, { status: 400 })
    }
    return ucFetch(path, token, undefined, sealedValue)
  }

  return Response.json({ error: "Invalid request" }, { status: 400 })
}

export async function PATCH(request: Request) {
  const { session, sealedValue } = await getServerSessionResult()
  const token = session?.idToken ?? undefined
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

  const body = await request.json()
  return ucFetch(
    path,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    sealedValue,
  )
}
