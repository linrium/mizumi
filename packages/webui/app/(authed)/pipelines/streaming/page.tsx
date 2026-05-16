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
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { toast } from "sonner"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ── Types ─────────────────────────────────────────────────────────────────────

type K8sStatus = {
  state: string
  driver_pod: string | null
  spark_ui_url: string | null
}

type StreamingJob = {
  id: string
  name: string
  namespace: string
  image: string
  main_application_file: string
  spark_version: string
  driver_cores: number
  driver_memory: string
  executor_instances: number
  executor_cores: number
  executor_memory: string
  created_at: string
  updated_at: string
  k8s_status: K8sStatus | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

type StateVariant = "success" | "warning" | "error" | "default"

const STATE_CONFIG: Record<string, { label: string; variant: StateVariant }> = {
  RUNNING: { label: "Running", variant: "success" },
  COMPLETED: { label: "Completed", variant: "default" },
  FAILED: { label: "Failed", variant: "error" },
  SUBMITTED: { label: "Submitted", variant: "warning" },
  PENDING: { label: "Pending", variant: "warning" },
  UNKNOWN: { label: "Unknown", variant: "default" },
}

function K8sStateBadge({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-muted-foreground">—</span>
  const cfg = STATE_CONFIG[state] ?? {
    label: state,
    variant: "default" as StateVariant,
  }
  return (
    <Status variant={cfg.variant}>
      <StatusIndicator />
      <StatusLabel>{cfg.label}</StatusLabel>
    </Status>
  )
}

// ── Columns ───────────────────────────────────────────────────────────────────

function buildColumns(
  onRestart: (job: StreamingJob) => void,
  onDelete: (job: StreamingJob) => void,
): ColumnDef<StreamingJob>[] {
  return [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium font-mono text-xs">
          {row.original.name}
        </span>
      ),
    },
    {
      id: "deployment",
      header: "Namespace",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.namespace}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {row.original.image}
          </div>
        </div>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: ({ row }) => (
        <K8sStateBadge state={row.original.k8s_status?.state} />
      ),
    },
    {
      id: "executors",
      header: "Executors",
      cell: ({ row }) => {
        const { executor_instances, executor_cores, executor_memory } =
          row.original
        return (
          <div className="space-y-0.5">
            <div className="font-medium">{executor_instances} instances</div>
            <div className="text-xs text-muted-foreground">
              {executor_cores} cores · {executor_memory}
            </div>
          </div>
        )
      },
    },
    {
      id: "created_at",
      header: "Created",
      accessorFn: (j) => fmtTimestamp(j.created_at),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={14} />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onRestart(row.original)
              }}
            >
              Restart
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(row.original)
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StreamingPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<StreamingJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restartTarget, setRestartTarget] = useState<StreamingJob | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StreamingJob | null>(null)
  const [actionPending, setActionPending] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithAuth("/api/streaming/jobs", {
        cache: "no-store",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setJobs(json.jobs ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleRestart() {
    if (!restartTarget || actionPending) return
    setActionPending(true)
    try {
      const res = await fetchWithAuth(
        `/api/streaming/jobs/${restartTarget.id}/restart`,
        { method: "POST" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast.success("Job restarted", { description: restartTarget.name })
      setRestartTarget(null)
      load()
    } catch (err) {
      toast.error("Failed to restart", {
        description: (err as Error).message,
      })
    } finally {
      setActionPending(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || actionPending) return
    setActionPending(true)
    try {
      const res = await fetchWithAuth(
        `/api/streaming/jobs/${deleteTarget.id}`,
        { method: "DELETE" },
      )
      if (res.status !== 204 && !res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      toast.success("Job deleted", { description: deleteTarget.name })
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error("Failed to delete", {
        description: (err as Error).message,
      })
    } finally {
      setActionPending(false)
    }
  }

  const columns = buildColumns(setRestartTarget, setDeleteTarget)
  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading streaming jobs…
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
                  router.push(`/pipelines/streaming/${row.original.id}`)
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No streaming jobs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog
        open={restartTarget != null}
        onOpenChange={(open) => {
          if (!open && !actionPending) setRestartTarget(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restart job?</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm restarting this streaming job.
            </DialogDescription>
          </DialogHeader>
          {restartTarget && (
            <div className="divide-y rounded-md border text-sm">
              <div className="px-3 py-2.5 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Job
                </p>
                <p className="font-mono font-medium">{restartTarget.name}</p>
                <p className="text-xs text-muted-foreground">
                  {restartTarget.namespace}
                </p>
              </div>
              <div className="px-3 py-2.5 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Current state
                </p>
                <K8sStateBadge state={restartTarget.k8s_status?.state} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={actionPending}
              onClick={() => setRestartTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={actionPending}
              onClick={handleRestart}
            >
              {actionPending ? "Restarting…" : "Restart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !actionPending) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete job?</DialogTitle>
            <DialogDescription className="sr-only">
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="divide-y rounded-md border text-sm">
              <div className="px-3 py-2.5 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Job
                </p>
                <p className="font-mono font-medium">{deleteTarget.name}</p>
                <p className="text-xs text-muted-foreground">
                  {deleteTarget.namespace}
                </p>
              </div>
              <div className="px-3 py-2.5 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Image
                </p>
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {deleteTarget.image}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={actionPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionPending}
              onClick={handleDelete}
            >
              {actionPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
