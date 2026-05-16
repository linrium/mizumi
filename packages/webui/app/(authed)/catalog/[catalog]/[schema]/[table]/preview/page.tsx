"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { DataGrid } from "@/components/data-grid/data-grid"
import { useDataGrid } from "@/hooks/use-data-grid"
import { useSessions } from "@/hooks/use-sessions"
import { readStoredIdToken } from "@/lib/auth/storage"

type QueryResponse = { columns: string[]; rows: unknown[][]; row_count: number }
type Row = Record<string, unknown>

async function runQuery(
  sessionId: string,
  sql: string,
): Promise<QueryResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, idToken: readStoredIdToken() ?? undefined }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as QueryResponse
}

function PreviewGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () =>
      queryResult.rows.map((row) =>
        Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]])),
      ),
    [queryResult],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      queryResult.columns.map((col) => ({
        id: col,
        accessorKey: col,
        header: col,
        size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
        meta: { cell: { variant: "short-text" as const } },
      })),
    [queryResult],
  )

  const { table, ...dataGridProps } = useDataGrid<Row>({
    data,
    columns,
    readOnly: true,
  })

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

export default function TablePreviewPage() {
  const { catalog, schema, table } = useParams<{
    catalog: string
    schema: string
    table: string
  }>()
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { createSession } = useSessions()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setQueryResult(null)
      try {
        const res = await fetch("/api/sessions")
        const data = res.ok ? await res.json() : { sessions: [] }
        const existing: { session_id: string }[] = data.sessions ?? []
        let sessionId = existing[0]?.session_id ?? null
        if (!sessionId) {
          const s = await createSession()
          if (!s) throw new Error("Failed to create session")
          sessionId = s.session_id
        }
        const result = await runQuery(
          sessionId,
          `SELECT * FROM ${catalog}.${schema}.${table} LIMIT 500`,
        )
        if (!cancelled) setQueryResult(result)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [catalog, schema, table, createSession])

  if (loading)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading preview…
      </div>
    )
  if (error)
    return (
      <div className="p-4 text-sm text-destructive font-mono whitespace-pre-wrap">
        {error}
      </div>
    )
  if (!queryResult) return null
  if (queryResult.row_count === 0)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Table is empty
      </div>
    )
  return <PreviewGrid queryResult={queryResult} />
}
