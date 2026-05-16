"use client"

import { DatabaseIcon, SecurityIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { getSchemasAction } from "../actions"
import { CatalogTabs } from "../catalog-tabs"
import type { Schema } from "@/services/catalog"

export default function CatalogPage() {
  const { catalog } = useParams<{ catalog: string }>()
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getSchemasAction(catalog)
      .then((data) => data.schemas ?? [])
      .then(setSchemas)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [catalog])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b shrink-0">
        <h1 className="text-sm font-semibold">{catalog}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {schemas.length} schema{schemas.length !== 1 ? "s" : ""}
        </p>
        <CatalogTabs
          tabs={[
            { href: `/catalog/${catalog}`, label: "schemas", active: true },
            {
              href: `/catalog/${catalog}/permissions`,
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
                  Comment
                </th>
              </tr>
            </thead>
            <tbody>
              {schemas.map((sch) => (
                <tr
                  key={sch.name}
                  className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-5 py-2">
                    <Link
                      href={`/catalog/${catalog}/${sch.name}`}
                      className="flex items-center gap-1.5 font-mono font-medium hover:underline underline-offset-2 w-fit"
                    >
                      <HugeiconsIcon
                        icon={DatabaseIcon}
                        size={13}
                        className="shrink-0 text-muted-foreground"
                      />
                      {sch.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2 text-muted-foreground">
                    {sch.comment ?? "—"}
                  </td>
                </tr>
              ))}
              {schemas.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No schemas found
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
