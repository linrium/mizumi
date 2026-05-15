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
    if (!res.ok) {
      return null
    }
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
  if (catalogs.length === 0) {
    return "(schema unavailable)"
  }

  const schemasByCatalog = await Promise.all(
    catalogs.map(async (catalog) => {
      const data = await ucGet<{ schemas: SchemaInfo[] }>(
        `/schemas?catalog_name=${catalog.name}&max_results=200`,
      )
      return (data?.schemas ?? []).filter(
        (schema) => schema.name !== "information_schema",
      )
    }),
  )

  const allSchemas = schemasByCatalog.flat()
  const tablesBySchema = await Promise.all(
    allSchemas.map(async (schema) => {
      const data = await ucGet<{ tables: TableInfo[] }>(
        `/tables?catalog_name=${schema.catalog_name}&schema_name=${schema.name}&max_results=200`,
      )
      return data?.tables ?? []
    }),
  )

  const details = await Promise.all(
    tablesBySchema
      .flat()
      .map((table) =>
        ucGet<TableDetail>(
          `/tables/${table.catalog_name}.${table.schema_name}.${table.name}`,
        ),
      ),
  )

  return details
    .flatMap((table) => {
      if (!table) {
        return []
      }

      const fqn = `${table.catalog_name}.${table.schema_name}.${table.name}`
      const columns = (table.columns ?? [])
        .map((column) => `  ${column.name} ${column.type_text}`)
        .join(",\n")

      return [`TABLE ${fqn}:\n${columns}`]
    })
    .join("\n\n")
}
