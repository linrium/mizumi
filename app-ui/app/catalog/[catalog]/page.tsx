'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { Database01Icon } from '@hugeicons/core-free-icons'

type Schema = { name: string; catalog_name: string; comment?: string }

async function fetchSchemas(catalog: string): Promise<Schema[]> {
  const res = await fetch(`/api/catalog?${new URLSearchParams({ type: 'schemas', catalog })}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.schemas ?? []
}

export default function CatalogPage() {
  const { catalog } = useParams<{ catalog: string }>()
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchSchemas(catalog)
      .then(setSchemas)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [catalog])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b shrink-0">
        <h1 className="text-sm font-semibold">{catalog}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{schemas.length} schema{schemas.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className="px-6 py-4 text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="px-6 py-4 text-xs text-destructive font-mono">{error}</p>}

        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-muted-foreground border-b">Name</th>
                <th className="px-5 py-2 text-left font-medium text-muted-foreground border-b">Comment</th>
              </tr>
            </thead>
            <tbody>
              {schemas.map((sch) => (
                <tr key={sch.name} className="border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="px-5 py-2">
                    <Link
                      href={`/catalog/${catalog}/${sch.name}`}
                      className="flex items-center gap-1.5 font-mono font-medium hover:underline underline-offset-2 w-fit"
                    >
                      <HugeiconsIcon icon={Database01Icon} size={13} className="shrink-0 text-muted-foreground" />
                      {sch.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2 text-muted-foreground">{sch.comment ?? '—'}</td>
                </tr>
              ))}
              {schemas.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-5 py-8 text-center text-muted-foreground">No schemas found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
