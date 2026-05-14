import { getServerSession } from "@/lib/auth/server"

const API_BASE = "http://localhost:8082/api/2.1/unity-catalog"

async function ucFetch(path: string, token: string | undefined) {
  const headers: Record<string, string> = {}
  console.log("token", token)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers,
  })
  if (!res.ok) {
    const text = await res.text()
    return Response.json({ error: text }, { status: res.status })
  }
  return Response.json(await res.json())
}

export async function GET(request: Request) {
  const session = await getServerSession()
  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : (session?.idToken ?? undefined)
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
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

  return Response.json({ error: "Invalid request" }, { status: 400 })
}
