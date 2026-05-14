"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react"
import dagre from "@dagrejs/dagre"
import "@xyflow/react/dist/style.css"
import { cn } from "@/lib/utils"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
dayjs.extend(relativeTime)

// ── API types ─────────────────────────────────────────────────────────────────

type ApiAssetNode = {
  path: string[]
  compute_kind: string | null
  group_name: string | null
  stale_status: string | null
  dependency_keys: string[][]
  depended_by_keys: string[][]
  last_materialization: { timestamp: string; run_id: string } | null
}

// ── Node data types ───────────────────────────────────────────────────────────

type AssetNodeData = {
  name: string
  path: string[]
  group_name: string | null
  compute_kind: string | null
  last_materialization: { timestamp: string; run_id: string } | null
  is_current: boolean
  [key: string]: unknown
}

type GroupNodeData = {
  label: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Dagster timestamps can be seconds or milliseconds; values > 1e12 are already ms.
function toDayjs(ts: string | null | undefined) {
  if (!ts) return null
  const v = Number(ts)
  if (!isFinite(v)) return null
  return v > 1e12 ? dayjs(v) : dayjs.unix(v)
}

function fmtRelTime(ts: string | null | undefined): string {
  const d = toDayjs(ts)
  return d ? d.fromNow() : "—"
}

function fmtDate(ts: string | null | undefined): string {
  const d = toDayjs(ts)
  return d ? d.format("MMM D, h:mm A") : "—"
}

// ── Custom node: asset card ───────────────────────────────────────────────────

function AssetNodeCard({ data }: { data: AssetNodeData }) {
  const mat = data.last_materialization
  return (
    <div
      className={cn(
        "bg-white dark:bg-zinc-900 rounded-lg overflow-hidden text-xs shadow-sm border-2 select-none",
        data.is_current
          ? "border-blue-500"
          : "border-zinc-200 dark:border-zinc-700",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-zinc-300 dark:!bg-zinc-600 !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-zinc-300 dark:!bg-zinc-600 !border-0"
      />

      {/* Name row */}
      <Link
        href={`/pipelines/assets/${data.path.join("/")}`}
        className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-zinc-400">▤</span>
        <span className="font-mono font-semibold text-xs">{data.name}</span>
      </Link>

      {/* Info rows */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Latest event</span>
          <span className={mat ? "text-blue-500 font-medium" : "text-zinc-400"}>
            {fmtRelTime(mat?.timestamp)}
          </span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Asset checks</span>
          <span className="text-zinc-400">—</span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Partitions</span>
          <span className="text-zinc-400">—</span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Automation</span>
          <span className="text-zinc-400">—</span>
        </div>
        <div
          className={cn(
            "flex justify-between items-center px-3 py-1.5",
            mat ? "bg-green-50 dark:bg-green-950/20" : "",
          )}
        >
          <span
            className={mat ? "text-green-600 font-medium" : "text-zinc-500"}
          >
            {mat ? "Materialized" : "Never materialized"}
          </span>
          <span className={mat ? "text-green-600" : "text-zinc-400"}>
            {fmtDate(mat?.timestamp)}
          </span>
        </div>
      </div>

      {/* Compute kind badge */}
      {data.compute_kind && (
        <div className="flex justify-end px-3 py-1.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60">
          <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
            <span className="text-orange-400">✦</span>
            <span className="capitalize">{data.compute_kind}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ── Custom node: group container ──────────────────────────────────────────────

function GroupContainerNode({ data }: { data: GroupNodeData }) {
  return (
    <div className="w-full h-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/40 pointer-events-none">
      <p className="px-4 pt-3 text-base font-semibold text-zinc-500 dark:text-zinc-400">
        {data.label}
      </p>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  assetCard: AssetNodeCard as NodeTypes[string],
  groupContainer: GroupContainerNode as NodeTypes[string],
}

// ── Layout constants ──────────────────────────────────────────────────────────

const CARD_W = 280
const CARD_H = 200 // approximate rendered height
const CARD_GAP = 16
const GROUP_PAD = 20
const GROUP_HEADER = 48

// Height of a group container for N assets
function groupHeight(n: number): number {
  return GROUP_HEADER + GROUP_PAD + n * CARD_H + (n - 1) * CARD_GAP + GROUP_PAD
}
function groupWidth(): number {
  return CARD_W + GROUP_PAD * 2
}

// ── Layout builder ────────────────────────────────────────────────────────────

function buildLayout(
  apiNodes: ApiAssetNode[],
  currentPathStr: string,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  if (apiNodes.length === 0) return { rfNodes: [], rfEdges: [] }

  const pathIndex = new Set(apiNodes.map((n) => n.path.join("/")))

  // Collect groups and build asset-to-group map
  const groups = new Map<string, ApiAssetNode[]>()
  for (const n of apiNodes) {
    const g = n.group_name ?? "default"
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(n)
  }

  // Build group-level dependency edges (for dagre rank assignment)
  const groupEdgePairs = new Set<string>()
  for (const n of apiNodes) {
    const srcGroup = n.group_name ?? "default"
    for (const dep of n.depended_by_keys) {
      const tgtKey = dep.join("/")
      if (!pathIndex.has(tgtKey)) continue
      const tgt = apiNodes.find((x) => x.path.join("/") === tgtKey)
      const tgtGroup = tgt?.group_name ?? "default"
      if (srcGroup !== tgtGroup) {
        groupEdgePairs.add(`${srcGroup}||${tgtGroup}`)
      }
    }
  }

  // Dagre layout on groups
  const gg = new dagre.graphlib.Graph()
  gg.setDefaultEdgeLabel(() => ({}))
  gg.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 100 })

  for (const [gName, gnodes] of groups) {
    gg.setNode(gName, {
      width: groupWidth(),
      height: groupHeight(gnodes.length),
    })
  }
  for (const pair of groupEdgePairs) {
    const [src, tgt] = pair.split("||")
    gg.setEdge(src, tgt)
  }
  dagre.layout(gg)

  // Compute group top-left positions from dagre (dagre gives center)
  const groupPos = new Map<string, { x: number; y: number }>()
  for (const [gName, gnodes] of groups) {
    const { x, y } = gg.node(gName)
    const w = groupWidth()
    const h = groupHeight(gnodes.length)
    groupPos.set(gName, { x: x - w / 2, y: y - h / 2 })
  }

  // Build RF nodes
  const rfNodes: Node[] = []
  const assetPos = new Map<string, { x: number; y: number }>()

  for (const [gName, gnodes] of groups) {
    const gp = groupPos.get(gName)!

    // Group container (z-index behind assets)
    rfNodes.push({
      id: `group:${gName}`,
      type: "groupContainer",
      position: gp,
      style: {
        width: groupWidth(),
        height: groupHeight(gnodes.length),
        zIndex: -1,
      },
      data: { label: gName } satisfies GroupNodeData,
      selectable: false,
      draggable: false,
    })

    // Asset nodes stacked inside the group
    for (let i = 0; i < gnodes.length; i++) {
      const n = gnodes[i]
      const key = n.path.join("/")
      const ax = gp.x + GROUP_PAD
      const ay = gp.y + GROUP_HEADER + GROUP_PAD + i * (CARD_H + CARD_GAP)
      assetPos.set(key, { x: ax, y: ay })

      rfNodes.push({
        id: key,
        type: "assetCard",
        position: { x: ax, y: ay },
        style: { width: CARD_W },
        data: {
          name: n.path[n.path.length - 1],
          path: n.path,
          group_name: n.group_name,
          compute_kind: n.compute_kind,
          last_materialization: n.last_materialization,
          is_current: key === currentPathStr,
        } satisfies AssetNodeData,
        draggable: false,
      })
    }
  }

  // Build edges between individual assets
  const rfEdges: Edge[] = []
  for (const n of apiNodes) {
    const src = n.path.join("/")
    for (const dep of n.depended_by_keys) {
      const tgt = dep.join("/")
      if (!pathIndex.has(tgt)) continue
      rfEdges.push({
        id: `${src}->${tgt}`,
        source: src,
        target: tgt,
        type: "default",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "#94a3b8",
        },
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      })
    }
  }

  return { rfNodes, rfEdges }
}

// ── Main component ────────────────────────────────────────────────────────────

export function LineageGraph({
  currentPath,
  neighborhoodOnly = false,
}: {
  currentPath?: string[]
  neighborhoodOnly?: boolean
}) {
  const currentPathStr = currentPath?.join("/") ?? ""

  const [apiNodes, setApiNodes] = useState<ApiAssetNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/dagster/asset-nodes", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        return (json.nodes ?? []) as ApiAssetNode[]
      })
      .then(setApiNodes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const visibleNodes = useMemo(() => {
    if (!neighborhoodOnly || !currentPathStr) return apiNodes
    const current = apiNodes.find((n) => n.path.join("/") === currentPathStr)
    if (!current) return apiNodes
    const neighborKeys = new Set<string>([
      currentPathStr,
      ...current.dependency_keys.map((k) => k.join("/")),
      ...current.depended_by_keys.map((k) => k.join("/")),
    ])
    return apiNodes.filter((n) => neighborKeys.has(n.path.join("/")))
  }, [apiNodes, currentPathStr, neighborhoodOnly])

  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(visibleNodes, currentPathStr),
    [visibleNodes, currentPathStr],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // Sync when layout changes after data loads
  useEffect(() => {
    setNodes(rfNodes)
  }, [rfNodes, setNodes])
  useEffect(() => {
    setEdges(rfEdges)
  }, [rfEdges, setEdges])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading lineage…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-destructive font-mono px-6 text-center">
        {error}
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(0,0,0,0.07)"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
