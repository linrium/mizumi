'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | number | null | undefined): string {
  if (!ts) return '—'
  const ms = typeof ts === 'string' ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
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
  const url = params ? `/api/dagster/${path}?${new URLSearchParams(params)}` : `/api/dagster/${path}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

async function materializeAsset(path: string[]): Promise<{ run_id: string }> {
  const res = await fetch(`/api/dagster/materialize/${path.join('/')}`, { method: 'POST' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as { run_id: string }
}

// ── MaterializeButton ─────────────────────────────────────────────────────────

function MaterializeButton({ path }: { path: string[] }) {
  const [pending, setPending] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setPending(true)
    try {
      const { run_id } = await materializeAsset(path)
      toast.success('Materialization started', { description: `Run ${run_id.slice(0, 8)}…` })
    } catch (err) {
      toast.error('Failed to materialize', { description: (err as Error).message })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-[10px] px-2 py-0.5 border rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {pending ? 'Starting…' : 'Materialize'}
    </button>
  )
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<AssetNode>[] = [
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
  { id: 'group',  header: 'Group',        accessorFn: (n) => n.group_name ?? '—' },
  { id: 'kind',   header: 'Kind',         accessorFn: (n) => n.compute_kind ?? '—' },
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
  { id: 'last_mat',   header: 'Last Materialized', accessorFn: (n) => fmtTimestamp(n.last_materialization?.timestamp) },
  { id: 'upstream',   header: 'Upstream',           accessorFn: (n) => n.dependency_keys.length || '—' },
  { id: 'downstream', header: 'Downstream',         accessorFn: (n) => n.depended_by_keys.length || '—' },
  { id: 'jobs',       header: 'Jobs',               accessorFn: (n) => n.job_names.join(', ') || '—' },
  { id: 'actions',    header: '',                   cell: ({ row }) => <MaterializeButton path={row.original.path} /> },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [nodes, setNodes] = useState<AssetNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ nodes: AssetNode[] }>('asset-nodes')
      .then((d) => setNodes(d.nodes))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const table = useReactTable({ data: nodes, columns: COLUMNS, getCoreRowModel: getCoreRowModel() })

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading assets…</div>
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
                No assets found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
