"use client"

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunStats {
  steps_canceled: number | null
  steps_failed: number | null
  steps_succeeded: number | null
}

interface Run {
  asset_selection: string[][]
  creation_time: number | null
  end_time: number | null
  job_name: string
  run_id: string
  start_time: number | null
  stats: RunStats | null
  status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | number | null | undefined): string {
  if (!ts) {
    return "—"
  }
  const ms = typeof ts === "string" ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
}

function fmtDuration(start: number | null, end: number | null): string {
  if (!start) {
    return "—"
  }
  const sec = Math.round((end ?? Date.now() / 1000) - start)
  if (sec < 60) {
    return `${sec}s`
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }
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
    CANCELED: { label: "Canceled", variant: "default" },
    CANCELING: { label: "Canceling", variant: "warning" },
    FAILURE: { label: "Failed", variant: "error" },
    NOT_STARTED: { label: "Not started", variant: "default" },
    QUEUED: { label: "Queued", variant: "default" },
    STARTED: { label: "Running", variant: "info" },
    STARTING: { label: "Starting", variant: "info" },
    SUCCESS: { label: "Success", variant: "success" },
  }
  const cfg = config[status]
  if (!cfg) {
    return <Badge variant="outline">{status}</Badge>
  }
  return (
    <Status variant={cfg.variant}>
      <StatusIndicator />
      <StatusLabel>{cfg.label}</StatusLabel>
    </Status>
  )
}

async function apiFetch<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = params
    ? `/api/dagster/${path}?${new URLSearchParams(params)}`
    : `/api/dagster/${path}`
  const res = await fetchWithAuth(url, { cache: "no-store" })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
  return json as T
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<Run>[] = [
  {
    accessorKey: "run_id",
    cell: ({ getValue }) => (
      <span className="font-mono text-muted-foreground">
        {getValue() as string}
      </span>
    ),
    header: "Run ID",
    id: "run_id",
  },
  {
    cell: ({ row }) => <RunStatusBadge status={row.original.status} />,
    header: "Status",
    id: "status",
  },
  {
    cell: ({ row }) => {
      const sel = row.original.asset_selection
      const visible = sel.length > 0 ? sel.slice(0, 3) : null
      const overflow = sel.length > 3 ? sel.length - 3 : 0
      if (!visible) {
        return (
          <Badge className="font-mono" variant="outline">
            {row.original.job_name}
          </Badge>
        )
      }
      return (
        <div className="flex flex-wrap gap-1">
          {visible.map((path, i) => (
            <Badge className="font-mono" key={i} variant="outline">
              {path.at(-1)}
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge className="text-muted-foreground" variant="outline">
              +{overflow}
            </Badge>
          )}
        </div>
      )
    },
    header: "Target",
    id: "target",
  },
  {
    accessorFn: (r) => fmtTimestamp(r.start_time ?? r.creation_time),
    header: "Started",
    id: "started",
  },
  {
    accessorFn: (r) => fmtDuration(r.start_time, r.end_time),
    header: "Duration",
    id: "duration",
  },
  {
    accessorFn: (r) => {
      const ok = r.stats?.steps_succeeded ?? 0
      const fail = r.stats?.steps_failed ?? 0
      const can = r.stats?.steps_canceled ?? 0
      const total = ok + fail + can
      return total ? `${ok}/${total}` : "—"
    },
    header: "Steps",
    id: "steps",
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
    columns: COLUMNS,
    data: runs,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading runs…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-destructive text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <TableRow className="hover:bg-transparent" key={hg.id}>
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
                className="cursor-pointer"
                key={row.id}
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
                className="h-24 text-center text-muted-foreground"
                colSpan={COLUMNS.length}
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
