'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  const map: Record<string, string> = {
    SUCCESS:     '✓ Success',
    FAILURE:     '✗ Failed',
    STARTED:     '▶ Running',
    STARTING:    '▶ Starting',
    QUEUED:      '· Queued',
    CANCELING:   '⊗ Canceling',
    CANCELED:    '⊘ Canceled',
    NOT_STARTED: '· Not started',
  }
  return map[status] ?? status
}

function fmtStaleStatus(s: string | null): string {
  if (!s) return '—'
  const map: Record<string, string> = {
    FRESH:   '✓ Fresh',
    STALE:   '⚠ Stale',
    MISSING: '✗ Missing',
    UNKNOWN: '? Unknown',
  }
  return map[s] ?? s
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

// ── DataTable ─────────────────────────────────────────────────────────────────

function DataTable<T>({ columns, data }: { columns: ColumnDef<T>[]; data: T[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No results
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Assets tab ────────────────────────────────────────────────────────────────

const ASSET_COLUMNS: ColumnDef<AssetNode>[] = [
  {
    id: 'name',
    header: 'Asset',
    cell: ({ row }) => (
      <Link
        href={`/pipelines/assets/${row.original.path.join('/')}`}
        className="font-medium hover:underline underline-offset-2"
      >
        {row.original.path[0] ?? ''}
      </Link>
    ),
  },
  {
    id: 'group',
    header: 'Group',
    accessorFn: (n) => n.group_name ?? '—',
  },
  {
    id: 'kind',
    header: 'Kind',
    accessorFn: (n) => n.compute_kind ?? '—',
  },
  {
    id: 'status',
    header: 'Stale Status',
    cell: ({ row }) => {
      const s = row.original.stale_status
      const cls: Record<string, string> = {
        FRESH:   'text-green-600 dark:text-green-400',
        STALE:   'text-yellow-600 dark:text-yellow-400',
        MISSING: 'text-destructive',
      }
      return <span className={cls[s ?? ''] ?? 'text-muted-foreground'}>{fmtStaleStatus(s)}</span>
    },
  },
  {
    id: 'last_mat',
    header: 'Last Materialized',
    accessorFn: (n) => fmtTimestamp(n.last_materialization?.timestamp),
  },
  {
    id: 'upstream',
    header: 'Upstream',
    accessorFn: (n) => n.dependency_keys.length || '—',
  },
  {
    id: 'downstream',
    header: 'Downstream',
    accessorFn: (n) => n.depended_by_keys.length || '—',
  },
  {
    id: 'jobs',
    header: 'Jobs',
    accessorFn: (n) => n.job_names.join(', ') || '—',
  },
]

function AssetsTab() {
  const [nodes, setNodes] = useState<AssetNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ nodes: AssetNode[] }>('asset-nodes')
      .then((d) => setNodes(d.nodes))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <EmptyState message="Loading assets…" />
  if (error)   return <ErrorState message={error} />
  return <DataTable columns={ASSET_COLUMNS} data={nodes} />
}

// ── Runs tab ──────────────────────────────────────────────────────────────────

const RUN_COLUMNS: ColumnDef<Run>[] = [
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const s = row.original.status
      const cls: Record<string, string> = {
        SUCCESS:  'text-green-600 dark:text-green-400',
        FAILURE:  'text-destructive',
        STARTED:  'text-blue-600 dark:text-blue-400',
        STARTING: 'text-blue-600 dark:text-blue-400',
      }
      return <span className={cls[s] ?? 'text-muted-foreground'}>{fmtStatus(s)}</span>
    },
  },
  { id: 'job',      header: 'Job',      accessorKey: 'job_name' },
  { id: 'started',  header: 'Started',  accessorFn: (r) => fmtTimestamp(r.start_time ?? r.creation_time) },
  { id: 'duration', header: 'Duration', accessorFn: (r) => fmtDuration(r.start_time, r.end_time) },
  {
    id: 'steps',
    header: 'Steps',
    accessorFn: (r) => {
      const ok  = r.stats?.steps_succeeded ?? 0
      const fail = r.stats?.steps_failed ?? 0
      const can  = r.stats?.steps_canceled ?? 0
      const total = ok + fail + can
      return total ? `${ok}/${total}` : '—'
    },
  },
  { id: 'run_id', header: 'Run ID', accessorKey: 'run_id', cell: ({ getValue }) => (
    <span className="font-mono text-muted-foreground">{getValue() as string}</span>
  ) },
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

  if (loading) return <EmptyState message="Loading runs…" />
  if (error)   return <ErrorState message={error} />
  if (!runs.length) return <EmptyState message="No runs found" />
  return <DataTable columns={RUN_COLUMNS} data={runs} />
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
