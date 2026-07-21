"use client"

import { IconDatabase, IconKey, IconShieldLock } from "@tabler/icons-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import type { Schema } from "@/services/catalog-types"
import { getSchemasAction } from "../actions"
import { CatalogTabs } from "../catalog-tabs"

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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-4">
        <h1 className="font-semibold text-sm">{catalog}</h1>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {schemas.length} schema{schemas.length === 1 ? "" : "s"}
        </p>
        <CatalogTabs
          tabs={[
            {
              active: true,
              href: `/catalog/${catalog}`,
              icon: IconDatabase,
              label: "schemas",
            },
            {
              active: false,
              href: `/catalog/${catalog}/permissions`,
              icon: IconShieldLock,
              label: "permissions",
            },
            {
              active: false,
              href: `/catalog/${catalog}/request-permissions`,
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
                  Comment
                </th>
              </tr>
            </thead>
            <tbody>
              {schemas.map((sch) => (
                <tr
                  className="border-border/60 border-b transition-colors last:border-0 hover:bg-accent/30"
                  key={sch.name}
                >
                  <td className="px-5 py-2">
                    <Link
                      className="flex w-fit items-center gap-1.5 font-medium font-mono underline-offset-2 hover:underline"
                      href={`/catalog/${catalog}/${sch.name}`}
                    >
                      <IconDatabase
                        className="shrink-0 text-muted-foreground"
                        size={13}
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
                    className="px-5 py-8 text-center text-muted-foreground"
                    colSpan={2}
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
