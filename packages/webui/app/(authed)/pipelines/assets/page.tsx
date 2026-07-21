"use client"

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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

type LastMaterialization = { timestamp: string; run_id: string }

type RunTag = { key: string; value: string }

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
  tags: RunTag[]
  last_materialization: LastMaterialization | null
}

function extractKinds(tags: RunTag[]): string[] {
  return tags
    .filter((t) => t.key.startsWith("dagster/kind/"))
    .map((t) => t.key.replace("dagster/kind/", ""))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | number | null | undefined): string {
  if (!ts) {
    return "—"
  }
  const ms = typeof ts === "string" ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
}

function StaleStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>
  }

  const config: Record<
    string,
    { label: string; variant: "success" | "warning" | "error" | "default" }
  > = {
    FRESH: { label: "Fresh", variant: "success" },
    MISSING: { label: "Missing", variant: "error" },
    STALE: { label: "Stale", variant: "warning" },
    UNKNOWN: { label: "Unknown", variant: "default" },
  }

  const cfg = config[status]
  if (!cfg) {
    return <span className="text-muted-foreground">{status}</span>
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

async function materializeAsset(path: string[]): Promise<{ run_id: string }> {
  const res = await fetchWithAuth(
    `/api/dagster/materialize/${path.join("/")}`,
    {
      method: "POST",
    }
  )
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
  return json as { run_id: string }
}

async function materializeManyAssets(
  paths: string[][]
): Promise<{ run_id: string }> {
  const res = await fetchWithAuth("/api/dagster/materialize-many", {
    body: JSON.stringify({ paths }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
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
      toast.success("Materialization started", {
        description: `Run ${run_id.slice(0, 8)}…`,
      })
    } catch (err) {
      console.error(err)
      toast.error("Failed to materialize", {
        description: (err as Error).message,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      className="whitespace-nowrap rounded border px-3 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      onClick={handleClick}
      type="button"
    >
      {pending ? "Starting…" : "Materialize"}
    </button>
  )
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<AssetNode>[] = [
  {
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableHiding: false,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    id: "select",
  },
  {
    cell: ({ row }) => (
      <Link
        className="font-medium underline-offset-2 hover:underline"
        href={`/pipelines/assets/${row.original.path.join("/")}`}
      >
        {row.original.path[0] ?? ""}
      </Link>
    ),
    header: "Asset",
    id: "name",
  },
  { accessorFn: (n) => n.group_name ?? "—", header: "Group", id: "group" },
  {
    cell: ({ row }) => {
      const kinds = extractKinds(row.original.tags)
      if (kinds.length === 0) {
        return <span className="text-muted-foreground">—</span>
      }
      return (
        <div className="flex flex-wrap gap-1">
          {kinds.map((k) => (
            <Badge className="capitalize" key={k} variant="outline">
              {k}
            </Badge>
          ))}
        </div>
      )
    },
    header: "Kind",
    id: "kind",
  },
  {
    cell: ({ row }) => <StaleStatusBadge status={row.original.stale_status} />,
    header: "Stale Status",
    id: "status",
  },
  {
    accessorFn: (n) => fmtTimestamp(n.last_materialization?.timestamp),
    header: "Last Materialized",
    id: "last_mat",
  },
  {
    accessorFn: (n) => n.dependency_keys.length || "—",
    header: "Upstream",
    id: "upstream",
  },
  {
    accessorFn: (n) => n.depended_by_keys.length || "—",
    header: "Downstream",
    id: "downstream",
  },
  {
    cell: ({ row }) => <MaterializeButton path={row.original.path} />,
    header: "",
    id: "actions",
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [nodes, setNodes] = useState<AssetNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState({})

  useEffect(() => {
    apiFetch<{ nodes: AssetNode[] }>("asset-nodes")
      .then((d) => setNodes(d.nodes))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const table = useReactTable({
    columns: COLUMNS,
    data: nodes,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  })

  const selectedCount = Object.keys(rowSelection).length
  const [materializingAll, setMaterializingAll] = useState(false)

  async function handleMaterializeSelected() {
    const selectedPaths = table
      .getSelectedRowModel()
      .rows.filter((r) => r.original.is_executable)
      .map((r) => r.original.path)
    setMaterializingAll(true)
    try {
      const { run_id } = await materializeManyAssets(selectedPaths)
      toast.success(
        `Materializing ${selectedPaths.length} asset${selectedPaths.length > 1 ? "s" : ""}`,
        {
          description: `Run ${run_id.slice(0, 8)}…`,
        }
      )
      setRowSelection({})
    } catch (err) {
      console.error(err)
      toast.error("Failed to materialize", {
        description: (err as Error).message,
      })
    } finally {
      setMaterializingAll(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading assets…
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

  const freshCount = nodes.filter((n) => n.stale_status === "FRESH").length
  const staleCount = nodes.filter((n) => n.stale_status === "STALE").length
  const missingCount = nodes.filter((n) => n.stale_status === "MISSING").length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-muted/50 px-4 text-sm">
        {selectedCount > 0 ? (
          <span className="text-muted-foreground">
            {selectedCount} selected
          </span>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>{nodes.length} assets</span>
            {freshCount > 0 && (
              <span className="text-green-600 dark:text-green-400">
                {freshCount} fresh
              </span>
            )}
            {staleCount > 0 && (
              <span className="text-yellow-600 dark:text-yellow-400">
                {staleCount} stale
              </span>
            )}
            {missingCount > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {missingCount} missing
              </span>
            )}
          </div>
        )}
        {selectedCount > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded border px-2 py-0.5 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={materializingAll}
              onClick={handleMaterializeSelected}
              type="button"
            >
              {materializingAll ? "Starting…" : "Materialize Selected"}
            </button>
            <button
              className="rounded border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
              onClick={() => setRowSelection({})}
              type="button"
            >
              Clear
            </button>
          </div>
        )}
      </div>
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
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
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
                  No assets found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
