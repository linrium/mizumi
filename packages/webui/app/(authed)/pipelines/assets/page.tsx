"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { toast } from "sonner"

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
  if (!ts) return "—"
  const ms = typeof ts === "string" ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
}

function StaleStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>

  const config: Record<
    string,
    { label: string; variant: "success" | "warning" | "error" | "default" }
  > = {
    FRESH: { label: "Fresh", variant: "success" },
    STALE: { label: "Stale", variant: "warning" },
    MISSING: { label: "Missing", variant: "error" },
    UNKNOWN: { label: "Unknown", variant: "default" },
  }

  const cfg = config[status]
  if (!cfg) return <span className="text-muted-foreground">{status}</span>

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

async function materializeAsset(path: string[]): Promise<{ run_id: string }> {
  const res = await fetchWithAuth(`/api/dagster/materialize/${path.join("/")}`, {
    method: "POST",
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as { run_id: string }
}

async function materializeManyAssets(
  paths: string[][],
): Promise<{ run_id: string }> {
  const res = await fetchWithAuth("/api/dagster/materialize-many", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  })
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
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs px-3 py-1 border rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {pending ? "Starting…" : "Materialize"}
    </button>
  )
}

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<AssetNode>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "name",
    header: "Asset",
    cell: ({ row }) => (
      <Link
        href={`/pipelines/assets/${row.original.path.join("/")}`}
        className="font-medium hover:underline underline-offset-2"
      >
        {row.original.path[0] ?? ""}
      </Link>
    ),
  },
  { id: "group", header: "Group", accessorFn: (n) => n.group_name ?? "—" },
  {
    id: "kind",
    header: "Kind",
    cell: ({ row }) => {
      const kinds = extractKinds(row.original.tags)
      if (kinds.length === 0)
        return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex flex-wrap gap-1">
          {kinds.map((k) => (
            <Badge key={k} variant="outline" className="capitalize">
              {k}
            </Badge>
          ))}
        </div>
      )
    },
  },
  {
    id: "status",
    header: "Stale Status",
    cell: ({ row }) => <StaleStatusBadge status={row.original.stale_status} />,
  },
  {
    id: "last_mat",
    header: "Last Materialized",
    accessorFn: (n) => fmtTimestamp(n.last_materialization?.timestamp),
  },
  {
    id: "upstream",
    header: "Upstream",
    accessorFn: (n) => n.dependency_keys.length || "—",
  },
  {
    id: "downstream",
    header: "Downstream",
    accessorFn: (n) => n.depended_by_keys.length || "—",
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <MaterializeButton path={row.original.path} />,
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
    data: nodes,
    columns: COLUMNS,
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
        },
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

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading assets…
      </div>
    )
  if (error)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">
        {error}
      </div>
    )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/50 text-sm shrink-0">
          <span className="text-muted-foreground">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={handleMaterializeSelected}
            disabled={materializingAll}
            className="text-xs px-2 py-0.5 border rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {materializingAll ? "Starting…" : "Materialize Selected"}
          </button>
          <button
            type="button"
            onClick={() => setRowSelection({})}
            className="text-xs px-2 py-0.5 border rounded hover:bg-muted transition-colors"
          >
            Clear
          </button>
        </div>
      )}
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
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
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
