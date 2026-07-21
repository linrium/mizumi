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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-4">
        <div className="flex items-baseline gap-1.5">
          <h1 className="font-semibold text-sm">{schema}</h1>
          <span className="font-mono text-muted-foreground text-xs">
            {catalog}
          </span>
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {tables.length} table{tables.length === 1 ? "" : "s"} ·{" "}
          {models.length} model{models.length === 1 ? "" : "s"}
        </p>
        <CatalogTabs
          tabs={[
            {
              active: true,
              href: `/catalog/${catalog}/${schema}`,
              icon: IconTableOptions,
              label: "objects",
            },
            {
              active: false,
              href: `/catalog/${catalog}/${schema}/permissions`,
              icon: IconShieldLock,
              label: "permissions",
            },
            {
              active: false,
              href: `/catalog/${catalog}/${schema}/request-permissions`,
              icon: IconKey,
              label: "request access",
            },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-6 py-4 text-muted-foreground text-xs">Loading…</p>
        ) : null}
        {error ? (
          <p className="px-6 py-4 font-mono text-destructive text-xs">
            {error}
          </p>
        ) : null}

        {!(loading || error) && (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="border-b px-5 py-2 text-left font-medium text-muted-foreground">
                  Name
                </th>
                <th className="border-b px-5 py-2 text-left font-medium text-muted-foreground">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {tables.map((tbl) => (
                <tr
                  className="border-border/60 border-b transition-colors last:border-0 hover:bg-accent/30"
                  key={tbl.name}
                >
                  <td className="px-5 py-2">
                    <Link
                      className="flex w-fit items-center gap-1.5 font-medium font-mono underline-offset-2 hover:underline"
                      href={`/catalog/${catalog}/${schema}/${tbl.name}`}
                    >
                      <IconTable
                        className="shrink-0 text-muted-foreground"
                        size={13}
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
                  className="border-border/60 border-b transition-colors last:border-0 hover:bg-accent/30"
                  key={`model:${model.name}`}
                >
                  <td className="px-5 py-2">
                    <Link
                      className="flex w-fit items-center gap-1.5 font-medium font-mono underline-offset-2 hover:underline"
                      href={`/catalog/${catalog}/${schema}/models/${model.name}`}
                    >
                      <IconBrain
                        className="shrink-0 text-muted-foreground"
                        size={13}
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
                    className="px-5 py-8 text-center text-muted-foreground"
                    colSpan={2}
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
