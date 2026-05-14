const UC_BASE =
  process.env.UC_BASE_URL ?? "http://localhost:8082/api/2.1/unity-catalog"

type CatalogInfo = { name: string }
type SchemaInfo = { name: string; catalog_name: string }
type TableInfo = { name: string; catalog_name: string; schema_name: string }
type ColumnInfo = { name: string; type_text: string }
type TableDetail = {
  name: string
  catalog_name: string
  schema_name: string
  columns: ColumnInfo[]
}

async function ucGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${UC_BASE}${path}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function fetchSchema(): Promise<string> {
  const catalogsData = await ucGet<{ catalogs: CatalogInfo[] }>(
    "/catalogs?max_results=100",
  )
  const catalogs = catalogsData?.catalogs ?? []
  if (catalogs.length === 0) return "(schema unavailable)"

  const schemasBycat = await Promise.all(
    catalogs.map(async (cat) => {
      const data = await ucGet<{ schemas: SchemaInfo[] }>(
        `/schemas?catalog_name=${cat.name}&max_results=200`,
      )
      return (data?.schemas ?? []).filter(
        (s) => s.name !== "information_schema",
      )
    }),
  )
  const allSchemas = schemasBycat.flat()

  const tablesBySchema = await Promise.all(
    allSchemas.map(async (s) => {
      const data = await ucGet<{ tables: TableInfo[] }>(
        `/tables?catalog_name=${s.catalog_name}&schema_name=${s.name}&max_results=200`,
      )
      return data?.tables ?? []
    }),
  )
  const allTables = tablesBySchema.flat()

  const details = await Promise.all(
    allTables.map((t) =>
      ucGet<TableDetail>(
        `/tables/${t.catalog_name}.${t.schema_name}.${t.name}`,
      ),
    ),
  )

  return details
    .filter(Boolean)
    .map((t) => {
      const fqn = `${t!.catalog_name}.${t!.schema_name}.${t!.name}`
      const cols = (t!.columns ?? [])
        .map((c) => `  ${c.name} ${c.type_text}`)
        .join(",\n")
      return `TABLE ${fqn}:\n${cols}`
    })
    .join("\n\n")
}
