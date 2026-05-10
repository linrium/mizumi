'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type LastMaterialization = { timestamp: string; run_id: string }

type AssetNode = {
  path: string[]
  compute_kind: string | null
  description: string | null
  group_name: string | null
  is_observable: boolean
  is_executable: boolean
  job_names: string[]
  dependency_keys: string[][]
  depended_by_keys: string[][]
  stale_status: string | null
  last_materialization: LastMaterialization | null
}

type StaleCause = {
  key: string[]
  reason: string
  dependency: string[] | null
  category: string
}

type MetadataEntry = {
  label: string
  type: string
  value: unknown
}

type Materialization = {
  timestamp: string
  run_id: string
  tags: { key: string; value: string }[]
  metadata: MetadataEntry[]
}

type AssetNodeDetail = {
  path: string[]
  compute_kind: string | null
  description: string | null
  group_name: string | null
  is_observable: boolean
  is_executable: boolean
  job_names: string[]
  dependency_keys: string[][]
  depended_by_keys: string[][]
  stale_status: string | null
  stale_causes: StaleCause[]
  materializations: Materialization[]
}

type RunStats = {
  steps_succeeded: number | null
  steps_failed: number | null
  steps_canceled: number | null
}

type Run = {
  run_id: string
  job_name: string
  status: string
  creation_time: number | null
  start_time: number | null
  end_time: number | null
  stats: RunStats | null
}

type AssetRow = Record<string, unknown>
type RunRow = Record<string, unknown>

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | number | null | undefined): string {
  if (!ts) return '—'
  const ms = typeof ts === 'string' ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
}

function fmtDuration(start: number | null, end: number | null): string {
  if (!start) return '—'
  const sec = Math.round((end ?? Date.now() / 1000) - start)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function fmtStatus(status: string): string {
  const icons: Record<string, string> = {
    SUCCESS: '✓ Success',
    FAILURE: '✗ Failed',
    STARTED: '▶ Running',
    STARTING: '▶ Starting',
    QUEUED: '· Queued',
    CANCELING: '⊗ Canceling',
    CANCELED: '⊘ Canceled',
    NOT_STARTED: '· Not started',
  }
  return icons[status] ?? status
}

function fmtStaleStatus(s: string | null): string {
  if (!s) return '—'
  const icons: Record<string, string> = {
    FRESH: '✓ Fresh',
    STALE: '⚠ Stale',
    MISSING: '✗ Missing',
    UNKNOWN: '? Unknown',
  }
  return icons[s] ?? s
}

function fmtMetadataValue(entry: MetadataEntry): string {
  if (entry.value === null || entry.value === undefined) return '—'
  if (entry.type === 'json') {
    try { return JSON.stringify(JSON.parse(entry.value as string), null, 2) }
    catch { return String(entry.value) }
  }
  return String(entry.value)
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = params
    ? `/api/dagster/${path}?${new URLSearchParams(params)}`
    : `/api/dagster/${path}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

// ── Grid wrapper ──────────────────────────────────────────────────────────────

function Grid<T extends Record<string, unknown>>({
  rows,
  columns,
}: {
  rows: T[]
  columns: ColumnDef<T>[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(500)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { table, ...dataGridProps } = useDataGrid<T>({ data: rows, columns, readOnly: true })

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

// ── Asset Detail Panel ────────────────────────────────────────────────────────

const STALE_CLS: Record<string, string> = {
  FRESH:   'text-green-600',
  STALE:   'text-yellow-600',
  MISSING: 'text-destructive',
  UNKNOWN: 'text-muted-foreground',
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-xs font-mono truncate">{value || '—'}</span>
    </div>
  )
}

function AssetDetailPanel({ path, onClose }: { path: string[]; onClose: () => void }) {
  const [detail, setDetail] = useState<AssetNodeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedMat, setExpandedMat] = useState<number | null>(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDetail(null)
    setExpandedMat(0)
    apiFetch<AssetNodeDetail>(`asset-nodes/${path.join('/')}`)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  return (
    <div className="w-80 shrink-0 border-l flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0">
        <span className="text-xs font-semibold truncate flex-1">{path.join(' / ')}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 text-sm">
        {loading && (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
            Loading…
          </div>
        )}
        {error && (
          <div className="px-4 py-3 text-xs text-destructive font-mono break-all">{error}</div>
        )}
        {detail && (
          <>
            {/* Stale status */}
            <div className="px-4 py-3 border-b">
              <span className={cn('text-xs font-medium', STALE_CLS[detail.stale_status ?? ''] ?? 'text-muted-foreground')}>
                {fmtStaleStatus(detail.stale_status)}
              </span>
            </div>

            {/* Key metadata */}
            <div className="px-4 py-3 border-b grid grid-cols-2 gap-3">
              {detail.group_name && <MetaItem label="Group" value={detail.group_name} />}
              {detail.compute_kind && <MetaItem label="Kind" value={detail.compute_kind} />}
              <MetaItem label="Upstream" value={detail.dependency_keys.length ? String(detail.dependency_keys.length) : '—'} />
              <MetaItem label="Downstream" value={detail.depended_by_keys.length ? String(detail.depended_by_keys.length) : '—'} />
              {detail.job_names.length > 0 && (
                <div className="col-span-2">
                  <MetaItem label="Jobs" value={detail.job_names.join(', ')} />
                </div>
              )}
            </div>

            {/* Description */}
            {detail.description && (
              <div className="px-4 py-3 border-b">
                <p className="text-xs text-muted-foreground leading-relaxed">{detail.description}</p>
              </div>
            )}

            {/* Stale causes */}
            {detail.stale_causes.length > 0 && (
              <div className="px-4 py-3 border-b">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Stale Causes</p>
                <div className="flex flex-col gap-2">
                  {detail.stale_causes.map((c, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-mono">{c.key.join('/')}</span>
                      <span className="text-muted-foreground"> — {c.reason}</span>
                      {c.dependency && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          dep: {c.dependency.join('/')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materializations */}
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                {detail.materializations.length
                  ? `Materializations (${detail.materializations.length})`
                  : 'Materializations'}
              </p>
              {detail.materializations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No materializations yet</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {detail.materializations.map((m, i) => (
                    <div key={i} className="border rounded overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedMat(expandedMat === i ? null : i)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-xs">{fmtTimestamp(m.timestamp)}</span>
                          <span className="text-[10px] font-mono text-muted-foreground truncate">{m.run_id}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                          {expandedMat === i ? '▲' : '▼'}
                        </span>
                      </button>
                      {expandedMat === i && (
                        <div className="border-t">
                          {m.metadata.length === 0 ? (
                            <p className="px-3 py-2 text-[10px] text-muted-foreground">No metadata</p>
                          ) : (
                            <div className="px-3 py-2 flex flex-col gap-2">
                              {m.metadata.map((entry, j) => (
                                <div key={j}>
                                  <span className="text-[10px] text-muted-foreground block">{entry.label}</span>
                                  <span className="text-xs font-mono break-all whitespace-pre-wrap">
                                    {fmtMetadataValue(entry)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Assets tab ────────────────────────────────────────────────────────────────

function AssetsTab() {
  const [nodes, setNodes] = useState<AssetNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null)

  useEffect(() => {
    apiFetch<{ nodes: AssetNode[] }>('asset-nodes')
      .then((d) => setNodes(d.nodes))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const columns = useMemo<ColumnDef<AssetRow>[]>(() => [
    {
      id: '_action',
      size: 36,
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setSelectedPath(row.original._path as string[])}
          className="flex items-center justify-center w-full h-full text-base text-muted-foreground hover:text-foreground transition-colors leading-none"
        >
          ›
        </button>
      ),
    },
    { id: 'name',        accessorKey: 'name',        header: 'Asset',             size: 200, meta: { cell: { variant: 'short-text' } } },
    { id: 'group',       accessorKey: 'group',       header: 'Group',             size: 120, meta: { cell: { variant: 'short-text' } } },
    { id: 'kind',        accessorKey: 'kind',        header: 'Kind',              size: 100, meta: { cell: { variant: 'short-text' } } },
    { id: 'status',      accessorKey: 'status',      header: 'Stale Status',      size: 130, meta: { cell: { variant: 'short-text' } } },
    { id: 'last_mat',    accessorKey: 'last_mat',    header: 'Last Materialized', size: 180, meta: { cell: { variant: 'short-text' } } },
    { id: 'upstream',    accessorKey: 'upstream',    header: 'Upstream',          size: 90,  meta: { cell: { variant: 'short-text' } } },
    { id: 'downstream',  accessorKey: 'downstream',  header: 'Downstream',        size: 100, meta: { cell: { variant: 'short-text' } } },
    { id: 'jobs',        accessorKey: 'jobs',        header: 'Jobs',              size: 180, meta: { cell: { variant: 'short-text' } } },
  ], [])

  const rows = useMemo<AssetRow[]>(
    () => nodes.map((n) => ({
      _path:      n.path,
      name:       n.path[0] ?? '',
      group:      n.group_name ?? '—',
      kind:       n.compute_kind ?? '—',
      status:     fmtStaleStatus(n.stale_status),
      last_mat:   fmtTimestamp(n.last_materialization?.timestamp),
      upstream:   n.dependency_keys.length || '—',
      downstream: n.depended_by_keys.length || '—',
      jobs:       n.job_names.join(', ') || '—',
    })),
    [nodes],
  )

  if (loading) return <EmptyState message="Loading assets…" />
  if (error)   return <ErrorState message={error} />

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <Grid rows={rows} columns={columns} />
      {selectedPath && (
        <AssetDetailPanel path={selectedPath} onClose={() => setSelectedPath(null)} />
      )}
    </div>
  )
}

// ── Runs tab ──────────────────────────────────────────────────────────────────

const RUN_COLUMNS: ColumnDef<RunRow>[] = [
  { id: 'status',   accessorKey: 'status',   header: 'Status',   size: 130, meta: { cell: { variant: 'short-text' } } },
  { id: 'job',      accessorKey: 'job',      header: 'Job',      size: 220, meta: { cell: { variant: 'short-text' } } },
  { id: 'started',  accessorKey: 'started',  header: 'Started',  size: 175, meta: { cell: { variant: 'short-text' } } },
  { id: 'duration', accessorKey: 'duration', header: 'Duration', size: 100, meta: { cell: { variant: 'short-text' } } },
  { id: 'steps',    accessorKey: 'steps',    header: 'Steps',    size: 90,  meta: { cell: { variant: 'short-text' } } },
  { id: 'run_id',   accessorKey: 'run_id',   header: 'Run ID',   size: 200, meta: { cell: { variant: 'short-text' } } },
]

function RunsTab() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ runs: Run[] }>('runs', { limit: '50' })
      .then((d) => setRuns(d.runs))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo<RunRow[]>(
    () => runs.map((r) => {
      const succeeded = r.stats?.steps_succeeded ?? 0
      const failed    = r.stats?.steps_failed ?? 0
      const canceled  = r.stats?.steps_canceled ?? 0
      const total     = succeeded + failed + canceled
      return {
        status:   fmtStatus(r.status),
        job:      r.job_name,
        started:  fmtTimestamp(r.start_time ?? r.creation_time),
        duration: fmtDuration(r.start_time, r.end_time),
        steps:    total ? `${succeeded}/${total}` : '—',
        run_id:   r.run_id,
      }
    }),
    [runs],
  )

  if (loading) return <EmptyState message="Loading runs…" />
  if (error)   return <ErrorState message={error} />
  if (!runs.length) return <EmptyState message="No runs found" />
  return <Grid rows={rows} columns={RUN_COLUMNS} />
}

// ── Shared states ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">
      {message}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'assets' | 'runs'
const TABS: { id: Tab; label: string }[] = [
  { id: 'assets', label: 'Assets' },
  { id: 'runs',   label: 'Runs' },
]

export default function PipelinesPage() {
  const [tab, setTab] = useState<Tab>('assets')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-0 px-5 border-b shrink-0">
        <span className="text-sm font-semibold mr-4">Pipelines</span>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {tab === 'assets' && <AssetsTab />}
        {tab === 'runs'   && <RunsTab />}
      </div>
    </div>
  )
}
