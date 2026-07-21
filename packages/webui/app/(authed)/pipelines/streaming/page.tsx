"use client"

import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

interface K8sStatus {
  driver_pod: string | null
  spark_ui_url: string | null
  state: string
}

interface StreamingJob {
  created_at: string
  driver_cores: number
  driver_memory: string
  executor_cores: number
  executor_instances: number
  executor_memory: string
  id: string
  image: string
  k8s_status: K8sStatus | null
  main_application_file: string
  name: string
  namespace: string
  spark_version: string
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) {
    return "—"
  }
  return new Date(ts).toLocaleString()
}

type StateVariant = "success" | "warning" | "error" | "default"

const STATE_CONFIG: Record<string, { label: string; variant: StateVariant }> = {
  COMPLETED: { label: "Completed", variant: "default" },
  FAILED: { label: "Failed", variant: "error" },
  PENDING: { label: "Pending", variant: "warning" },
  RUNNING: { label: "Running", variant: "success" },
  SUBMITTED: { label: "Submitted", variant: "warning" },
  UNKNOWN: { label: "Unknown", variant: "default" },
}

function K8sStateBadge({ state }: { state: string | null | undefined }) {
  if (!state) {
    return <span className="text-muted-foreground">—</span>
  }
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
  onDelete: (job: StreamingJob) => void
): ColumnDef<StreamingJob>[] {
  return [
    {
      cell: ({ row }) => (
        <span className="font-medium font-mono text-xs">
          {row.original.name}
        </span>
      ),
      header: "Name",
      id: "name",
    },
    {
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.namespace}</div>
          <div className="font-mono text-muted-foreground text-xs">
            {row.original.image}
          </div>
        </div>
      ),
      header: "Namespace",
      id: "deployment",
    },
    {
      cell: ({ row }) => (
        <K8sStateBadge state={row.original.k8s_status?.state} />
      ),
      header: "State",
      id: "state",
    },
    {
      cell: ({ row }) => {
        const { executor_instances, executor_cores, executor_memory } =
          row.original
        return (
          <div className="space-y-0.5">
            <div className="font-medium">{executor_instances} instances</div>
            <div className="text-muted-foreground text-xs">
              {executor_cores} cores · {executor_memory}
            </div>
          </div>
        )
      },
      header: "Executors",
      id: "executors",
    },
    {
      accessorFn: (j) => fmtTimestamp(j.created_at),
      header: "Created",
      id: "created_at",
    },
    {
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              onClick={(e) => e.stopPropagation()}
              size="icon-sm"
              type="button"
              variant="ghost"
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
      header: "",
      id: "actions",
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
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      setJobs(json.jobs ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  async function handleRestart() {
    if (!restartTarget || actionPending) {
      return
    }
    setActionPending(true)
    try {
      const res = await fetchWithAuth(
        `/api/streaming/jobs/${restartTarget.id}/restart`,
        { method: "POST" }
      )
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
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
    if (!deleteTarget || actionPending) {
      return
    }
    setActionPending(true)
    try {
      const res = await fetchWithAuth(
        `/api/streaming/jobs/${deleteTarget.id}`,
        { method: "DELETE" }
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
    columns,
    data: jobs,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading streaming jobs…
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
                  router.push(`/pipelines/streaming/${row.original.id}`)
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell className="align-top" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={columns.length}
              >
                No streaming jobs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || actionPending)) {
            setRestartTarget(null)
          }
        }}
        open={restartTarget !== null}
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
              <div className="space-y-0.5 px-3 py-2.5">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  Job
                </p>
                <p className="font-medium font-mono">{restartTarget.name}</p>
                <p className="text-muted-foreground text-xs">
                  {restartTarget.namespace}
                </p>
              </div>
              <div className="space-y-1 px-3 py-2.5">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  Current state
                </p>
                <K8sStateBadge state={restartTarget.k8s_status?.state} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={actionPending}
              onClick={() => setRestartTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={actionPending}
              onClick={handleRestart}
              type="button"
            >
              {actionPending ? "Restarting…" : "Restart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || actionPending)) {
            setDeleteTarget(null)
          }
        }}
        open={deleteTarget !== null}
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
              <div className="space-y-0.5 px-3 py-2.5">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  Job
                </p>
                <p className="font-medium font-mono">{deleteTarget.name}</p>
                <p className="text-muted-foreground text-xs">
                  {deleteTarget.namespace}
                </p>
              </div>
              <div className="space-y-0.5 px-3 py-2.5">
                <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  Image
                </p>
                <p className="break-all font-mono text-muted-foreground text-xs">
                  {deleteTarget.image}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={actionPending}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={actionPending}
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              {actionPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
