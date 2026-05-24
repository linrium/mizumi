"use client"

import {
  IconBrain,
  IconKey,
  IconShieldLock,
  IconTable,
  IconTableOptions,
} from "@tabler/icons-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import type {
  RegisteredModelSummary,
  TableSummary,
} from "@/services/catalog-types"
import { getModelsAction, getTablesAction } from "../../actions"
import { CatalogTabs } from "../../catalog-tabs"

export default function SchemaPage() {
  const { catalog, schema } = useParams<{ catalog: string; schema: string }>()
  const [tables, setTables] = useState<TableSummary[]>([])
  const [models, setModels] = useState<RegisteredModelSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getTablesAction(catalog, schema),
      getModelsAction(catalog, schema).catch(() => ({
        registered_models: [] as RegisteredModelSummary[],
      })),
    ])
      .then(([tablesData, modelsData]) => {
        setTables(tablesData.tables ?? [])
        setModels(modelsData.registered_models ?? [])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [catalog, schema])

  const objectCount = tables.length + models.length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-4 shrink-0">
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-sm font-semibold">{schema}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {catalog}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tables.length} table{tables.length !== 1 ? "s" : ""} ·{" "}
          {models.length} model{models.length !== 1 ? "s" : ""}
        </p>
        <CatalogTabs
          tabs={[
            {
              href: `/catalog/${catalog}/${schema}`,
              label: "objects",
              active: true,
              icon: IconTableOptions,
            },
            {
              href: `/catalog/${catalog}/${schema}/permissions`,
              label: "permissions",
              active: false,
              icon: IconShieldLock,
            },
            {
              href: `/catalog/${catalog}/${schema}/request-permissions`,
              label: "request access",
              active: false,
              icon: IconKey,
            },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-6 py-4 text-xs text-muted-foreground">Loading…</p>
        )}
        {error && (
          <p className="px-6 py-4 text-xs text-destructive font-mono">
            {error}
          </p>
        )}

        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-muted-foreground border-b">
                  Name
                </th>
                <th className="px-5 py-2 text-left font-medium text-muted-foreground border-b">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {tables.map((tbl) => (
                <tr
                  key={tbl.name}
                  className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-5 py-2">
                    <Link
                      href={`/catalog/${catalog}/${schema}/${tbl.name}`}
                      className="flex items-center gap-1.5 font-mono font-medium hover:underline underline-offset-2 w-fit"
                    >
                      <IconTable
                        size={13}
                        className="shrink-0 text-muted-foreground"
                      />
                      {tbl.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2 text-muted-foreground">
                    {tbl.table_type}
                  </td>
                </tr>
              ))}
              {models.map((model) => (
                <tr
                  key={`model:${model.name}`}
                  className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-5 py-2">
                    <Link
                      href={`/catalog/${catalog}/${schema}/models/${model.name}`}
                      className="flex items-center gap-1.5 font-mono font-medium hover:underline underline-offset-2 w-fit"
                    >
                      <IconBrain
                        size={13}
                        className="shrink-0 text-muted-foreground"
                      />
                      {model.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2 text-muted-foreground">MODEL</td>
                </tr>
              ))}
              {objectCount === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No objects found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
