"use client"

import dagre from "@dagrejs/dagre"
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeTypes,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import "@xyflow/react/dist/style.css"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import { cn } from "@/lib/utils"

dayjs.extend(relativeTime)

type RuntimeInfo = {
  source_system: string
  latest_run_id: string | null
  latest_run_status: string | null
  latest_run_started_at: string | null
  latest_run_ended_at: string | null
  latest_materialization_at: string | null
  latest_materialization_run_id: string | null
  unstarted_run_ids: string[]
  in_progress_run_ids: string[]
  metadata: Record<string, unknown>
  observed_at: string
}

type ApiLineageNode = {
  id: string
  node_type: string
  platform: string
  namespace: string
  name: string
  display_name: string
  properties: Record<string, unknown>
  runtime: RuntimeInfo | null
}

type ApiLineageEdge = {
  id: string
  source: string
  target: string
  edge_type: string
  confidence: number
  properties: Record<string, unknown>
}

type ApiLineageGraph = {
  root: ApiLineageNode | null
  direction: string
  depth: number
  nodes: ApiLineageNode[]
  edges: ApiLineageEdge[]
}

type LineageNodeData = {
  id: string
  displayName: string
  nodeType: string
  platform: string
  properties: Record<string, unknown>
  runtime: RuntimeInfo | null
  isCurrent: boolean
  href: string | null
  [key: string]: unknown
}

function toDayjs(ts: string | null | undefined) {
  if (!ts) return null
  const d = dayjs(ts)
  return d.isValid() ? d : null
}

function fmtRelTime(ts: string | null | undefined) {
  const d = toDayjs(ts)
  return d ? d.fromNow() : "—"
}

function fmtAbsTime(ts: string | null | undefined) {
  const d = toDayjs(ts)
  return d ? d.format("MMM D, h:mm A") : "—"
}

function nodeAccent(nodeType: string) {
  switch (nodeType) {
    case "table":
      return "border-emerald-300 bg-emerald-50/60"
    case "topic":
      return "border-amber-300 bg-amber-50/60"
    case "dagster_asset":
      return "border-sky-300 bg-sky-50/60"
    case "spark_job":
    case "streaming_job":
    case "daft_job":
    case "dagster_job":
      return "border-rose-300 bg-rose-50/60"
    case "schedule":
      return "border-violet-300 bg-violet-50/60"
    case "catalog":
    case "schema":
      return "border-zinc-300 bg-zinc-50/60"
    default:
      return "border-zinc-200 bg-white"
  }
}

function nodeIcon(nodeType: string) {
  switch (nodeType) {
    case "table":
      return "▦"
    case "topic":
      return "◉"
    case "dagster_asset":
      return "◫"
    case "spark_job":
    case "streaming_job":
      return "⚙"
    case "daft_job":
      return "◇"
    case "dagster_job":
      return "▸"
    case "schedule":
      return "◷"
    case "catalog":
      return "▤"
    case "schema":
      return "⋮"
    default:
      return "•"
  }
}

function latestTimestamp(runtime: RuntimeInfo | null) {
  return (
    runtime?.latest_materialization_at ?? runtime?.latest_run_started_at ?? null
  )
}

function nodeHref(node: ApiLineageNode) {
  if (node.node_type === "dagster_asset") {
    return `/pipelines/assets/${node.name}`
  }
  return null
}

function typeLabel(node: ApiLineageNode) {
  if (node.node_type === "table") {
    const catalog = String(node.properties.catalog_name ?? "")
    const schema = String(node.properties.schema_name ?? "")
    if (catalog && schema) return `${catalog}.${schema}`
  }
  return node.platform
}

function LineageNodeCard({ data }: { data: LineageNodeData }) {
  const runtime = data.runtime
  const isActive =
    (runtime?.in_progress_run_ids.length ?? 0) > 0 ||
    (runtime?.unstarted_run_ids.length ?? 0) > 0
  const latest = latestTimestamp(runtime)

  const body = (
    <div
      className={cn(
        "rounded-lg overflow-hidden text-xs shadow-sm border-2 select-none bg-white",
        nodeAccent(data.nodeType),
        data.isCurrent ? "ring-2 ring-blue-500 border-blue-500" : "",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-zinc-300 !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-zinc-300 !border-0"
      />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200/80">
        <span className="text-zinc-500">{nodeIcon(data.nodeType)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-mono font-semibold truncate">
            {data.displayName}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide truncate">
            {data.nodeType.replaceAll("_", " ")}
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-200/70">
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Platform</span>
          <span className="text-zinc-700 capitalize">{data.platform}</span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5 gap-2">
          <span className="text-zinc-500">Scope</span>
          <span className="text-zinc-700 truncate">
            {typeLabel({
              id: data.id,
              node_type: data.nodeType,
              platform: data.platform,
              namespace: "",
              name: "",
              display_name: data.displayName,
              properties: data.properties,
              runtime: data.runtime,
            } as ApiLineageNode)}
          </span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Latest event</span>
          <span
            className={latest ? "text-blue-600 font-medium" : "text-zinc-400"}
          >
            {fmtRelTime(latest)}
          </span>
        </div>
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Run state</span>
          <span
            className={cn(
              "font-medium",
              isActive
                ? "text-orange-600"
                : runtime?.latest_run_status === "SUCCESS"
                  ? "text-green-600"
                  : runtime?.latest_run_status
                    ? "text-zinc-700"
                    : "text-zinc-400",
            )}
          >
            {isActive ? "Active" : (runtime?.latest_run_status ?? "—")}
          </span>
        </div>
        <div
          className={cn(
            "flex justify-between items-center px-3 py-1.5",
            latest ? "bg-green-50/70" : "",
          )}
        >
          <span
            className={latest ? "text-green-700 font-medium" : "text-zinc-500"}
          >
            {latest ? "Observed" : "No runtime"}
          </span>
          <span className={latest ? "text-green-700" : "text-zinc-400"}>
            {fmtAbsTime(latest)}
          </span>
        </div>
      </div>
    </div>
  )

  if (!data.href) return body

  return (
    <Link
      href={data.href}
      className="block hover:opacity-90 transition-opacity"
    >
      {body}
    </Link>
  )
}

const nodeTypes: NodeTypes = {
  lineageCard: LineageNodeCard as NodeTypes[string],
}

const CARD_W = 290
const CARD_H = 190

function buildLayout(
  graph: ApiLineageGraph,
  currentId: string | null,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 90 })

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: CARD_W, height: CARD_H })
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const rfNodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      id: node.id,
      type: "lineageCard",
      position: {
        x: pos.x - CARD_W / 2,
        y: pos.y - CARD_H / 2,
      },
      style: { width: CARD_W },
      data: {
        id: node.id,
        displayName: node.display_name,
        nodeType: node.node_type,
        platform: node.platform,
        properties: node.properties,
        runtime: node.runtime,
        isCurrent: node.id === currentId,
        href: nodeHref(node),
      } satisfies LineageNodeData,
      draggable: false,
    }
  })

  const rfEdges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: "#94a3b8",
    },
    style: {
      stroke: "#94a3b8",
      strokeWidth: edge.edge_type === "contains" ? 1 : 1.6,
      strokeDasharray: edge.edge_type === "contains" ? "4 4" : undefined,
    },
    label: edge.edge_type.replaceAll("_", " "),
    labelStyle: {
      fontSize: 10,
      fill: "#64748b",
      textTransform: "capitalize",
    },
    labelBgStyle: { fill: "rgba(255,255,255,0.9)" },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }))

  return { rfNodes, rfEdges }
}

export function LineageGraph({
  currentPath,
  neighborhoodOnly = false,
}: {
  currentPath?: string[]
  neighborhoodOnly?: boolean
}) {
  const rootToken = currentPath?.join("/") ?? null

  const [graph, setGraph] = useState<ApiLineageGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (rootToken) {
      params.set("root", rootToken)
    }
    params.set("direction", "both")
    params.set("depth", neighborhoodOnly ? "2" : "6")

    fetchWithAuth(`/api/lineage/graph?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        return json as ApiLineageGraph
      })
      .then((data) => {
        if (!cancelled) setGraph(data)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [rootToken, neighborhoodOnly])

  const currentId = graph?.root?.id ?? null
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graph) return { rfNodes: [], rfEdges: [] }
    return buildLayout(graph, currentId)
  }, [graph, currentId])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

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

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No lineage found
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
      elementsSelectable
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
