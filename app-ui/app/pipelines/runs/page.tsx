'use client'

import { useEffect, useState } from 'react'
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// ── Types ─────────────────────────────────────────────────────────────────────

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

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = params ? `/api/dagster/${path}?${new URLSearchParams(params)}` : `/api/dagster/${path}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<Run>[] = [
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
      const ok    = r.stats?.steps_succeeded ?? 0
      const fail  = r.stats?.steps_failed ?? 0
      const can   = r.stats?.steps_canceled ?? 0
      const total = ok + fail + can
      return total ? `${ok}/${total}` : '—'
    },
  },
  {
    id: 'run_id',
    header: 'Run ID',
    accessorKey: 'run_id',
    cell: ({ getValue }) => (
      <span className="font-mono text-muted-foreground">{getValue() as string}</span>
    ),
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ runs: Run[] }>('runs', { limit: '50' })
      .then((d) => setRuns(d.runs))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const table = useReactTable({ data: runs, columns: COLUMNS, getCoreRowModel: getCoreRowModel() })

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading runs…</div>
  if (error)   return <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">{error}</div>

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
              <TableCell colSpan={COLUMNS.length} className="h-24 text-center text-muted-foreground">
                No runs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
