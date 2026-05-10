const UC_BASE =
  process.env.UC_BASE_URL ??
  'http://localhost:8082/api/2.1/unity-catalog'

async function ucFetch(path: string) {
  const res = await fetch(`${UC_BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    return Response.json({ error: text }, { status: res.status })
  }
  return Response.json(await res.json())
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const catalog = searchParams.get('catalog')
  const schema = searchParams.get('schema')

  if (type === 'catalogs') {
    return ucFetch('/catalogs')
  }
  if (type === 'schemas' && catalog) {
    return ucFetch(`/schemas?catalog_name=${catalog}&max_results=200`)
  }
  if (type === 'tables' && catalog && schema) {
    return ucFetch(`/tables?catalog_name=${catalog}&schema_name=${schema}&max_results=200`)
  }
  if (type === 'table' && catalog && schema) {
    const table = searchParams.get('table')
    return ucFetch(`/tables/${catalog}.${schema}.${table}`)
  }

  return Response.json({ error: 'Invalid request' }, { status: 400 })
}
