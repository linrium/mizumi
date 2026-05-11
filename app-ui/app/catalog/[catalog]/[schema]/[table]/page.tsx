'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, TableIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useSessions } from '@/hooks/use-sessions'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'

// ── Types ─────────────────────────────────────────────────────────────────────

type Column = { name: string; type_text: string; nullable: boolean; comment?: string }
type TableDetail = {
  name: string
  catalog_name: string
  schema_name: string
  table_type: string
  data_source_format?: string
  storage_location?: string
  comment?: string
  columns: Column[]
}
type QueryResponse = { columns: string[]; rows: unknown[][]; row_count: number }
type Row = Record<string, unknown>

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/catalog?${new URLSearchParams(params)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

async function runQuery(sessionId: string, sql: string): Promise<QueryResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as QueryResponse
}

// ── Schema tab ────────────────────────────────────────────────────────────────

function SchemaTab({ detail }: { detail: TableDetail }) {
  return (
    <div className="flex-1 overflow-auto">
      {(detail.data_source_format || detail.storage_location) && (
        <div className="px-5 py-3 border-b shrink-0 flex flex-wrap gap-4">
          {detail.data_source_format && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Format</p>
              <p className="text-xs mt-0.5">{detail.data_source_format}</p>
            </div>
          )}
          {detail.storage_location && (
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Location</p>
              <p className="text-xs mt-0.5 font-mono truncate">{detail.storage_location}</p>
            </div>
          )}
        </div>
      )}
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">Column</th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">Type</th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">Nullable</th>
          </tr>
        </thead>
        <tbody>
          {detail.columns.map((col, i) => (
            <tr
              key={col.name}
              className={cn(
                'border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors',
                i % 2 === 0 ? 'bg-background' : 'bg-muted/20',
              )}
            >
              <td className="px-4 py-2 font-mono font-medium">{col.name}</td>
              <td className="px-4 py-2 font-mono text-muted-foreground">{col.type_text}</td>
              <td className="px-4 py-2 text-muted-foreground">{col.nullable ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Preview tab ───────────────────────────────────────────────────────────────

function PreviewGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () => queryResult.rows.map((row) =>
      Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]]))
    ),
    [queryResult],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () => queryResult.columns.map((col) => ({
      id: col,
      accessorKey: col,
      header: col,
      size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
      meta: { cell: { variant: 'short-text' as const } },
    })),
    [queryResult],
  )

  const { table, ...dataGridProps } = useDataGrid<Row>({ data, columns, readOnly: true })

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

function PreviewTab({ catalog, schema, table }: { catalog: string; schema: string; table: string }) {
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
        const res = await fetch('/api/sessions')
        const data = res.ok ? await res.json() : { sessions: [] }
        const existing: { session_id: string }[] = data.sessions ?? []
        let sessionId = existing[0]?.session_id ?? null
        if (!sessionId) {
          const s = await createSession()
          if (!s) throw new Error('Failed to create session')
          sessionId = s.session_id
        }
        const result = await runQuery(sessionId, `SELECT * FROM ${catalog}.${schema}.${table} LIMIT 500`)
        if (!cancelled) setQueryResult(result)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [catalog, schema, table, createSession])

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading preview…</div>
  if (error) return <div className="p-4 text-sm text-destructive font-mono whitespace-pre-wrap">{error}</div>
  if (!queryResult) return null
  if (queryResult.row_count === 0) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Table is empty</div>
  return <PreviewGrid queryResult={queryResult} />
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'schema' | 'preview'

export default function TablePage() {
  const { catalog, schema, table } = useParams<{ catalog: string; schema: string; table: string }>()
  const [detail, setDetail] = useState<TableDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('schema')

  useEffect(() => {
    setDetail(null)
    setError(null)
    setActiveTab('schema')
    apiFetch<TableDetail>({ type: 'table', catalog, schema, table })
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [catalog, schema, table])

  if (error) return <div className="p-4 text-sm text-destructive font-mono">{error}</div>
  if (!detail) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>

  const fullPath = `${detail.catalog_name}.${detail.schema_name}.${detail.name}`

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <HugeiconsIcon icon={TableIcon} size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">{detail.name}</h2>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {detail.table_type}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 group/path">
          <p className="text-xs text-muted-foreground font-mono">{fullPath}</p>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(fullPath); toast.success('Copied to clipboard') }}
            className="opacity-0 group-hover/path:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Copy01Icon} size={12} />
          </button>
        </div>
        {detail.comment && <p className="text-xs text-muted-foreground mt-1.5 italic">{detail.comment}</p>}
      </div>

      <div className="flex items-center gap-0 px-5 border-b shrink-0">
        {(['schema', 'preview'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'schema' && <SchemaTab detail={detail} />}
      {activeTab === 'preview' && (
        <PreviewTab key={fullPath} catalog={catalog} schema={schema} table={table} />
      )}
    </div>
  )
}
