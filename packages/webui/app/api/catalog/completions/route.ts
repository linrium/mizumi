import { NextResponse } from "next/server"
import {
  getCatalogs,
  getSchemas,
  getTables,
  getTable,
} from "@/services/catalog"

export type CatalogCompletionSchema = {
  catalogs: string[]
  tables: Array<{
    catalog: string
    schema: string
    name: string
    columns: Array<{ name: string; type: string }>
  }>
}

export async function GET() {
  try {
    const { catalogs } = await getCatalogs()

    const schemasPerCatalog = await Promise.all(
      catalogs.map(async (cat) => {
        try {
          const { schemas } = await getSchemas(cat.name)
          return schemas.filter((s) => s.name !== "information_schema")
        } catch {
          return []
        }
      })
    )

    const allSchemas = schemasPerCatalog.flat()

    const tablesPerSchema = await Promise.all(
      allSchemas.map(async (schema) => {
        try {
          const { tables } = await getTables(schema.catalog_name, schema.name)
          return tables
        } catch {
          return []
        }
      })
    )

    const allTables = tablesPerSchema.flat()

    const tableDetails = await Promise.all(
      allTables.map(async (t) => {
        try {
          return await getTable(t.catalog_name, t.schema_name, t.name)
        } catch {
          return null
        }
      })
    )

    const result: CatalogCompletionSchema = {
      catalogs: catalogs.map((c) => c.name),
      tables: tableDetails
        .filter((t) => t !== null)
        .map((t) => ({
          catalog: t.catalog_name,
          schema: t.schema_name,
          name: t.name,
          columns: t.columns.map((c) => ({ name: c.name, type: c.type_text })),
        })),
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({
      catalogs: [],
      tables: [],
    } satisfies CatalogCompletionSchema)
  }
}
