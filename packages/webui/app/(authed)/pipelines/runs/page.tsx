"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"

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
  asset_selection: string[][]
  stats: RunStats | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | number | null | undefined): string {
  if (!ts) return "—"
  const ms = typeof ts === "string" ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
}

function fmtDuration(start: number | null, end: number | null): string {
  if (!start) return "—"
  const sec = Math.round((end ?? Date.now() / 1000) - start)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function RunStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    {
      label: string
      variant: "success" | "error" | "info" | "warning" | "default"
    }
  > = {
    SUCCESS: { label: "Success", variant: "success" },
    FAILURE: { label: "Failed", variant: "error" },
    STARTED: { label: "Running", variant: "info" },
    STARTING: { label: "Starting", variant: "info" },
    QUEUED: { label: "Queued", variant: "default" },
    CANCELING: { label: "Canceling", variant: "warning" },
    CANCELED: { label: "Canceled", variant: "default" },
    NOT_STARTED: { label: "Not started", variant: "default" },
  }
  const cfg = config[status]
  if (!cfg) return <Badge variant="outline">{status}</Badge>
  return (
    <Status variant={cfg.variant}>
      <StatusIndicator />
      <StatusLabel>{cfg.label}</StatusLabel>
    </Status>
  )
}

async function apiFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = params
    ? `/api/dagster/${path}?${new URLSearchParams(params)}`
    : `/api/dagster/${path}`
  const res = await fetchWithAuth(url, { cache: "no-store" })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<Run>[] = [
  {
    id: "run_id",
    header: "Run ID",
    accessorKey: "run_id",
    cell: ({ getValue }) => (
      <span className="font-mono text-muted-foreground">
        {getValue() as string}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <RunStatusBadge status={row.original.status} />,
  },
  {
    id: "target",
    header: "Target",
    cell: ({ row }) => {
      const sel = row.original.asset_selection
      const visible = sel.length > 0 ? sel.slice(0, 3) : null
      const overflow = sel.length > 3 ? sel.length - 3 : 0
      if (!visible)
        return (
          <Badge variant="outline" className="font-mono">
            {row.original.job_name}
          </Badge>
        )
      return (
        <div className="flex flex-wrap gap-1">
          {visible.map((path, i) => (
            <Badge key={i} variant="outline" className="font-mono">
              {path[path.length - 1]}
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              +{overflow}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    id: "started",
    header: "Started",
    accessorFn: (r) => fmtTimestamp(r.start_time ?? r.creation_time),
  },
  {
    id: "duration",
    header: "Duration",
    accessorFn: (r) => fmtDuration(r.start_time, r.end_time),
  },
  {
    id: "steps",
    header: "Steps",
    accessorFn: (r) => {
      const ok = r.stats?.steps_succeeded ?? 0
      const fail = r.stats?.steps_failed ?? 0
      const can = r.stats?.steps_canceled ?? 0
      const total = ok + fail + can
      return total ? `${ok}/${total}` : "—"
    },
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    apiFetch<{ runs: Run[] }>("runs", { limit: "50" })
      .then((d) => setRuns(d.runs))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const table = useReactTable({
    data: runs,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading runs…
      </div>
    )
  if (error)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">
        {error}
      </div>
    )

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder
                    ? null
                    : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/pipelines/runs/${row.original.run_id}`)
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="h-24 text-center text-muted-foreground"
              >
                No runs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
