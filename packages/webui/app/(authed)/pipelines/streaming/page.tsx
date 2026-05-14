"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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

// ── Action buttons ────────────────────────────────────────────────────────────

function ConfirmButton({
  label,
  confirmLabel,
  pendingLabel,
  className,
  onConfirm,
}: {
  label: string
  confirmLabel: string
  pendingLabel: string
  className?: string
  onConfirm: () => Promise<void>
}) {
  const [stage, setStage] = useState<"idle" | "confirming" | "pending">("idle")

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (stage === "idle") {
      setStage("confirming")
      return
    }
    if (stage === "confirming") {
      setStage("pending")
      onConfirm().finally(() => setStage("idle"))
    }
  }

  function handleBlur() {
    if (stage === "confirming") setStage("idle")
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={handleBlur}
      disabled={stage === "pending"}
      className={`text-xs px-3 py-1 border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
        stage === "confirming" ? "bg-muted" : "hover:bg-muted"
      } ${className ?? ""}`}
    >
      {stage === "pending"
        ? pendingLabel
        : stage === "confirming"
          ? confirmLabel
          : label}
    </button>
  )
}

function RestartButton({
  id,
  name,
  onDone,
}: {
  id: string
  name: string
  onDone: () => void
}) {
  async function doRestart() {
    const res = await fetch(`/api/streaming/jobs/${id}/restart`, {
      method: "POST",
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
    toast.success("Job restarted", { description: name })
    onDone()
  }

  return (
    <ConfirmButton
      label="Restart"
      confirmLabel="Confirm restart"
      pendingLabel="Restarting…"
      onConfirm={async () => {
        try {
          await doRestart()
        } catch (err) {
          toast.error("Failed to restart", {
            description: (err as Error).message,
          })
        }
      }}
    />
  )
}

function DeleteButton({
  id,
  name,
  onDone,
}: {
  id: string
  name: string
  onDone: () => void
}) {
  async function doDelete() {
    const res = await fetch(`/api/streaming/jobs/${id}`, { method: "DELETE" })
    if (res.status !== 204 && !res.ok) {
      const json = await res.json()
      throw new Error(json.error ?? `HTTP ${res.status}`)
    }
    toast.success("Job deleted", { description: name })
    onDone()
  }

  return (
    <ConfirmButton
      label="Delete"
      confirmLabel="Confirm delete"
      pendingLabel="Deleting…"
      className="text-destructive"
      onConfirm={async () => {
        try {
          await doDelete()
        } catch (err) {
          toast.error("Failed to delete", {
            description: (err as Error).message,
          })
        }
      }}
    />
  )
}

// ── Columns ───────────────────────────────────────────────────────────────────

function buildColumns(reload: () => void): ColumnDef<StreamingJob>[] {
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
    { id: "namespace", header: "Namespace", accessorFn: (j) => j.namespace },
    { id: "image", header: "Image", accessorFn: (j) => j.image },
    {
      id: "state",
      header: "State",
      cell: ({ row }) => (
        <K8sStateBadge state={row.original.k8s_status?.state} />
      ),
    },
    {
      id: "driver_pod",
      header: "Driver Pod",
      accessorFn: (j) => j.k8s_status?.driver_pod ?? "—",
    },
    {
      id: "executor_instances",
      header: "Executors",
      accessorFn: (j) => j.executor_instances,
    },
    {
      id: "executor_cores",
      header: "Executor Cores",
      accessorFn: (j) => j.executor_cores,
    },
    {
      id: "executor_memory",
      header: "Executor Memory",
      accessorFn: (j) => j.executor_memory,
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
        <div className="flex gap-1.5">
          <RestartButton
            id={row.original.id}
            name={row.original.name}
            onDone={reload}
          />
          <DeleteButton
            id={row.original.id}
            name={row.original.name}
            onDone={reload}
          />
        </div>
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

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/streaming/jobs", { cache: "no-store" })
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

  const columns = buildColumns(load)
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
                  <TableCell key={cell.id}>
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
    </div>
  )
}
