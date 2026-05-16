"use client"

import { SecurityIcon, TableIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import type { TableSummary } from "@/services/catalog-types"
import { getTablesAction } from "../../actions"
import { CatalogTabs } from "../../catalog-tabs"

export default function SchemaPage() {
  const { catalog, schema } = useParams<{ catalog: string; schema: string }>()
  const [tables, setTables] = useState<TableSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getTablesAction(catalog, schema)
      .then((data) => data.tables ?? [])
      .then(setTables)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [catalog, schema])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b shrink-0">
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-sm font-semibold">{schema}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {catalog}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tables.length} table{tables.length !== 1 ? "s" : ""}
        </p>
        <CatalogTabs
          tabs={[
            {
              href: `/catalog/${catalog}/${schema}`,
              label: "tables",
              active: true,
            },
            {
              href: `/catalog/${catalog}/${schema}/permissions`,
              label: "permissions",
              active: false,
              icon: SecurityIcon,
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
                      <HugeiconsIcon
                        icon={TableIcon}
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
              {tables.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No tables found
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
