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
  type ReactFlowInstance,
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

type LineageGraphView = ApiLineageGraph & {
  containmentEdges: ApiLineageEdge[]
}

export type LineageFilters = {
  query?: string
  nodeTypes?: string[]
  runtimeOnly?: boolean
  includeContains?: boolean
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
  canExpand: boolean
  isExpanded: boolean
  onExpand: ((id: string) => void) | null
  [key: string]: unknown
}

type LineageGroupData = {
  id: string
  displayName: string
  nodeType: "catalog" | "schema"
  isCurrent: boolean
}

type LineageFlowNode =
  | Node<LineageNodeData, "lineageCard">
  | Node<LineageGroupData, "lineageGroup">

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
    case "dashboard":
      return "border-indigo-300 bg-indigo-50/60"
    case "mlflow_experiment":
      return "border-orange-300 bg-orange-50/60"
    case "mlflow_model":
      return "border-pink-300 bg-pink-50/60"
    case "pretrained_model":
      return "border-teal-300 bg-teal-50/60"
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
    case "dashboard":
      return "▣"
    case "mlflow_experiment":
      return "⊞"
    case "mlflow_model":
      return "⊕"
    case "pretrained_model":
      return "⬡"
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
  if (node.properties.__disableLink) {
    return null
  }
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

      <div className="flex items-start gap-2 px-3 py-2 border-b border-zinc-200/80">
        <span className="text-zinc-500 mt-0.5 shrink-0">{nodeIcon(data.nodeType)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-mono font-semibold break-words whitespace-normal leading-snug">
            {data.displayName}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">
            {data.nodeType.replaceAll("_", " ")}
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-200/70">
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-zinc-500">Platform</span>
          <span className="text-zinc-700 capitalize">{data.platform}</span>
        </div>
        <div className="flex justify-between items-start px-3 py-1.5 gap-2">
          <span className="text-zinc-500 shrink-0">Scope</span>
          <span className="text-zinc-700 break-words text-right">
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
        {data.canExpand && (
          <div className="px-3 py-2 flex justify-end bg-white/80">
            <button
              type="button"
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors",
                data.isExpanded
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
              )}
              onClick={(event) => {
                event.stopPropagation()
                data.onExpand?.(data.id)
              }}
            >
              {data.isExpanded ? "Expanded" : "Expand"}
            </button>
          </div>
        )}
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

function groupAccent(nodeType: "catalog" | "schema", isCurrent: boolean) {
  if (nodeType === "catalog") {
    return cn(
      "border-amber-400/80 bg-amber-100/70",
      isCurrent ? "ring-2 ring-amber-500 border-amber-500" : "",
    )
  }
  return cn(
    "border-sky-400/75 bg-sky-100/70",
    isCurrent ? "ring-2 ring-sky-500 border-sky-500" : "",
  )
}

function LineageGroupNode({ data }: { data: LineageGroupData }) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-2xl border-2 border-dashed px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
        groupAccent(data.nodeType, data.isCurrent),
      )}
    >
      <div className="flex items-center gap-2 text-zinc-700">
        <span className="text-sm">{nodeIcon(data.nodeType)}</span>
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
            {data.displayName}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {data.nodeType}
          </div>
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  lineageCard: LineageNodeCard as NodeTypes[string],
  lineageGroup: LineageGroupNode as NodeTypes[string],
}

const CARD_W = 290
const BASE_CARD_H = 210
const EXPANDABLE_CARD_H = 250
const GROUP_HEADER_H = 44
const GROUP_PAD_X = 20
const GROUP_PAD_Y = 18
const GROUP_MIN_W = 260
const GROUP_MIN_H = 120

function cardHeight(node: ApiLineageNode) {
  return node.properties.__canExpand ? EXPANDABLE_CARD_H : BASE_CARD_H
}

function isGroupNodeType(nodeType: string) {
  return nodeType === "catalog" || nodeType === "schema"
}

function boundsFromRects(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function buildLayout(
  graph: ApiLineageGraph,
  containmentEdges: ApiLineageEdge[],
  currentId: string | null,
): { rfNodes: LineageFlowNode[]; rfEdges: Edge[] } {
  const containsEdges = containmentEdges
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const groupedNodes = graph.nodes.filter((node) =>
    isGroupNodeType(node.node_type),
  )
  const leafNodes = graph.nodes.filter(
    (node) => !isGroupNodeType(node.node_type),
  )
  const groupedNodeIds = new Set(groupedNodes.map((node) => node.id))
  const leafNodeIds = new Set(leafNodes.map((node) => node.id))
  const schemaChildren = new Map<string, string[]>()
  const catalogChildren = new Map<string, string[]>()
  for (const edge of containsEdges) {
    const sourceNode = nodesById.get(edge.source)
    const targetNode = nodesById.get(edge.target)
    if (!sourceNode || !targetNode) continue

    if (
      sourceNode.node_type === "schema" &&
      targetNode.node_type === "table" &&
      leafNodeIds.has(edge.target)
    ) {
      schemaChildren.set(edge.source, [
        ...(schemaChildren.get(edge.source) ?? []),
        edge.target,
      ])
    }
    if (
      sourceNode.node_type === "catalog" &&
      targetNode.node_type === "schema" &&
      groupedNodeIds.has(edge.target)
    ) {
      catalogChildren.set(edge.source, [
        ...(catalogChildren.get(edge.source) ?? []),
        edge.target,
      ])
    }
  }

  const schemaForLeaf = new Map<string, string>()
  for (const [schemaId, childIds] of schemaChildren) {
    for (const childId of childIds) {
      schemaForLeaf.set(childId, schemaId)
    }
  }
  const catalogForSchema = new Map<string, string>()
  for (const [catalogId, childSchemaIds] of catalogChildren) {
    for (const schemaId of childSchemaIds) {
      catalogForSchema.set(schemaId, catalogId)
    }
  }

  // Compound dagre layout: schemas and catalogs are cluster nodes containing
  // their children. Dagre keeps cluster children together and places unrelated
  // nodes outside the cluster bounds, eliminating the visual-wrapping problem
  // where standalone leaves landed inside a schema's bounding box.
  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 90 })

  // Dagre's compound layout sizes each cluster from a tight bound around its
  // children plus a small auto-margin (~25px). Our visual schema/catalog rects
  // are taller because of the custom header + extra padding. To make dagre
  // reserve enough room around each cluster — so neighboring non-child nodes
  // (placed at the rank directly above/below) don't visually clip into our
  // headers — we inflate each cluster-child leaf's dagre height by the parent
  // chain's header+padding overhead. The leaf's *rendered* size stays the
  // original `cardHeight(node)`; only its position is shifted within the
  // inflated dagre slot so the extra room sits where the header will live.
  const LEAF_EXTRA_TOP_PER_LEVEL = GROUP_HEADER_H + GROUP_PAD_Y
  const LEAF_EXTRA_BOTTOM_PER_LEVEL = GROUP_PAD_Y
  const leafExtraTop = new Map<string, number>()
  const leafExtraBottom = new Map<string, number>()
  for (const node of leafNodes) {
    const schemaId = schemaForLeaf.get(node.id)
    let extraTop = 0
    let extraBottom = 0
    if (schemaId) {
      extraTop += LEAF_EXTRA_TOP_PER_LEVEL
      extraBottom += LEAF_EXTRA_BOTTOM_PER_LEVEL
      if (catalogForSchema.has(schemaId)) {
        extraTop += LEAF_EXTRA_TOP_PER_LEVEL
        extraBottom += LEAF_EXTRA_BOTTOM_PER_LEVEL
      }
    }
    leafExtraTop.set(node.id, extraTop)
    leafExtraBottom.set(node.id, extraBottom)
    g.setNode(node.id, {
      width: CARD_W,
      height: cardHeight(node) + extraTop + extraBottom,
    })
    if (schemaId) g.setParent(node.id, schemaId)
  }

  for (const schemaNode of groupedNodes.filter(
    (node) => node.node_type === "schema",
  )) {
    const hasChildren = (schemaChildren.get(schemaNode.id) ?? []).length > 0
    if (hasChildren) {
      // Compound parent — size derived from children.
      g.setNode(schemaNode.id, {})
    } else {
      // Fallback standalone group with explicit size.
      g.setNode(schemaNode.id, { width: GROUP_MIN_W, height: GROUP_MIN_H })
    }
    const catalogId = catalogForSchema.get(schemaNode.id)
    if (catalogId) g.setParent(schemaNode.id, catalogId)
  }

  for (const catalogNode of groupedNodes.filter(
    (node) => node.node_type === "catalog",
  )) {
    const hasChildSchemas =
      (catalogChildren.get(catalogNode.id) ?? []).length > 0
    if (hasChildSchemas) {
      g.setNode(catalogNode.id, {})
    } else {
      g.setNode(catalogNode.id, {
        width: GROUP_MIN_W + 40,
        height: GROUP_MIN_H,
      })
    }
  }

  for (const edge of graph.edges) {
    if (edge.edge_type === "contains") continue
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue
    if (isGroupNodeType(nodesById.get(edge.source)?.node_type ?? "")) continue
    if (isGroupNodeType(nodesById.get(edge.target)?.node_type ?? "")) continue
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  // Absolute leaf rects from dagre positions. The rendered leaf is shifted
  // within its (possibly inflated) dagre slot so the reserved header room
  // ends up above it. shift = (extraTop - extraBottom) / 2 from dagre center.
  const leafAbsRects = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >()
  for (const node of leafNodes) {
    const pos = g.node(node.id)
    const height = cardHeight(node)
    const extraTop = leafExtraTop.get(node.id) ?? 0
    const extraBottom = leafExtraBottom.get(node.id) ?? 0
    const centerY = (pos?.y ?? 0) + (extraTop - extraBottom) / 2
    leafAbsRects.set(node.id, {
      x: (pos?.x ?? 0) - CARD_W / 2,
      y: centerY - height / 2,
      width: CARD_W,
      height,
    })
  }

  // Schema rects: tight bounds around children + custom header/padding so the
  // visual cluster matches our rendered header. Fallback to dagre's own size
  // if the schema has no children.
  const schemaRects = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >()
  for (const schemaNode of groupedNodes.filter(
    (node) => node.node_type === "schema",
  )) {
    const childIds = schemaChildren.get(schemaNode.id) ?? []
    const childRects = childIds
      .map((id) => leafAbsRects.get(id))
      .filter(
        (
          rect,
        ): rect is { x: number; y: number; width: number; height: number } =>
          !!rect,
      )

    if (childRects.length === 0) {
      const pos = g.node(schemaNode.id)
      const width = pos?.width ?? GROUP_MIN_W
      const height = pos?.height ?? GROUP_MIN_H
      schemaRects.set(schemaNode.id, {
        x: (pos?.x ?? 0) - width / 2,
        y: (pos?.y ?? 0) - height / 2,
        width,
        height,
      })
      continue
    }

    const bounds = boundsFromRects(childRects)
    schemaRects.set(schemaNode.id, {
      x: bounds.x - GROUP_PAD_X,
      y: bounds.y - GROUP_HEADER_H - GROUP_PAD_Y,
      width: Math.max(bounds.width + GROUP_PAD_X * 2, GROUP_MIN_W),
      height: Math.max(
        bounds.height + GROUP_HEADER_H + GROUP_PAD_Y * 2,
        GROUP_MIN_H,
      ),
    })
  }

  // Catalog rects: tight bounds around contained schemas + header/padding.
  const catalogRects = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >()
  for (const catalogNode of groupedNodes.filter(
    (node) => node.node_type === "catalog",
  )) {
    const childSchemaIds = catalogChildren.get(catalogNode.id) ?? []
    const childRects = childSchemaIds
      .map((id) => schemaRects.get(id))
      .filter(
        (
          rect,
        ): rect is { x: number; y: number; width: number; height: number } =>
          !!rect,
      )

    if (childRects.length === 0) {
      const pos = g.node(catalogNode.id)
      const width = pos?.width ?? GROUP_MIN_W + 40
      const height = pos?.height ?? GROUP_MIN_H
      catalogRects.set(catalogNode.id, {
        x: (pos?.x ?? 0) - width / 2,
        y: (pos?.y ?? 0) - height / 2,
        width,
        height,
      })
      continue
    }

    const bounds = boundsFromRects(childRects)
    catalogRects.set(catalogNode.id, {
      x: bounds.x - GROUP_PAD_X,
      y: bounds.y - GROUP_HEADER_H - GROUP_PAD_Y,
      width: Math.max(bounds.width + GROUP_PAD_X * 2, GROUP_MIN_W + 40),
      height: Math.max(
        bounds.height + GROUP_HEADER_H + GROUP_PAD_Y * 2,
        GROUP_MIN_H + 20,
      ),
    })
  }

  // Assemble React Flow nodes. Catalogs first (lowest z-index), then schemas
  // (positioned relative to their catalog if any), then leaves (positioned
  // relative to their schema if any).
  const rfNodes: LineageFlowNode[] = []

  for (const catalogNode of groupedNodes.filter(
    (node) => node.node_type === "catalog",
  )) {
    const rect = catalogRects.get(catalogNode.id)
    if (!rect) continue
    rfNodes.push({
      id: catalogNode.id,
      type: "lineageGroup",
      position: { x: rect.x, y: rect.y },
      style: { width: rect.width, height: rect.height, zIndex: -2 },
      data: {
        id: catalogNode.id,
        displayName: catalogNode.display_name,
        nodeType: "catalog",
        isCurrent: catalogNode.id === currentId,
      },
      draggable: false,
      selectable: true,
    })
  }

  for (const schemaNode of groupedNodes.filter(
    (node) => node.node_type === "schema",
  )) {
    const rect = schemaRects.get(schemaNode.id)
    if (!rect) continue
    const catalogId = catalogForSchema.get(schemaNode.id)
    const catalogRect = catalogId ? catalogRects.get(catalogId) : undefined
    const schemaFlow: Node<LineageGroupData, "lineageGroup"> = {
      id: schemaNode.id,
      type: "lineageGroup",
      position: catalogRect
        ? { x: rect.x - catalogRect.x, y: rect.y - catalogRect.y }
        : { x: rect.x, y: rect.y },
      style: { width: rect.width, height: rect.height, zIndex: -1 },
      data: {
        id: schemaNode.id,
        displayName: schemaNode.display_name,
        nodeType: "schema",
        isCurrent: schemaNode.id === currentId,
      },
      draggable: false,
      selectable: true,
    }
    if (catalogRect) {
      schemaFlow.parentId = catalogId
      schemaFlow.extent = "parent"
    }
    rfNodes.push(schemaFlow)
  }

  for (const node of leafNodes) {
    const absRect = leafAbsRects.get(node.id)
    if (!absRect) continue
    const schemaId = schemaForLeaf.get(node.id)
    const schemaRect = schemaId ? schemaRects.get(schemaId) : undefined
    const leafFlow: Node<LineageNodeData, "lineageCard"> = {
      id: node.id,
      type: "lineageCard",
      position: schemaRect
        ? { x: absRect.x - schemaRect.x, y: absRect.y - schemaRect.y }
        : { x: absRect.x, y: absRect.y },
      style: { width: CARD_W, height: absRect.height },
      data: {
        id: node.id,
        displayName: node.display_name,
        nodeType: node.node_type,
        platform: node.platform,
        properties: node.properties,
        runtime: node.runtime,
        isCurrent: node.id === currentId,
        href: nodeHref(node),
        canExpand: false,
        isExpanded: false,
        onExpand: null,
      } satisfies LineageNodeData,
      draggable: false,
    }
    if (schemaRect) {
      leafFlow.parentId = schemaId
      leafFlow.extent = "parent"
    }
    rfNodes.push(leafFlow)
  }

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
  enableNeighborhoodSelection = false,
  selectRoot = false,
  selectRootHint,
  initialDepth,
  filters,
}: {
  currentPath?: string[]
  neighborhoodOnly?: boolean
  enableNeighborhoodSelection?: boolean
  selectRoot?: boolean
  selectRootHint?: { displayName: string; nodeType: string }
  initialDepth?: number
  filters?: LineageFilters
}) {
  const rootToken = currentPath?.join("/") ?? null

  const [graph, setGraph] = useState<ApiLineageGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelectedNodeId(null)

    const params = new URLSearchParams()
    if (rootToken) {
      params.set("root", rootToken)
    }
    params.set("direction", "both")
    params.set("depth", neighborhoodOnly ? String(initialDepth ?? 2) : "6")

    fetchWithAuth(`/api/lineage/graph?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        return json as ApiLineageGraph
      })
      .then((data) => {
        if (!cancelled) {
          setGraph(data)
          if (selectRoot) {
            if (data.root) {
              setSelectedNodeId(data.root.id)
            } else if (selectRootHint) {
              const match = data.nodes.find(
                (n) =>
                  n.node_type === selectRootHint.nodeType &&
                  (n.display_name === selectRootHint.displayName ||
                    n.name === selectRootHint.displayName),
              )
              if (match) setSelectedNodeId(match.id)
            }
          }
        }
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
  }, [rootToken, neighborhoodOnly, selectRoot, selectRootHint, initialDepth])

  const filteredGraph = useMemo<LineageGraphView | null>(() => {
    if (!graph) return null

    const query = filters?.query?.trim().toLowerCase() ?? ""
    const allowedNodeTypes = new Set(filters?.nodeTypes ?? [])
    const enforceNodeTypes = allowedNodeTypes.size > 0
    const includeContains = filters?.includeContains ?? true
    const runtimeOnly = filters?.runtimeOnly ?? false

    const matchesFilters = (node: ApiLineageNode) => {
      const matchesQuery =
        query.length === 0 ||
        node.display_name.toLowerCase().includes(query) ||
        node.name.toLowerCase().includes(query) ||
        node.node_type.toLowerCase().includes(query) ||
        node.platform.toLowerCase().includes(query)

      const matchesType =
        !enforceNodeTypes || allowedNodeTypes.has(node.node_type)

      const matchesRuntime =
        !runtimeOnly ||
        !!(
          node.runtime?.latest_materialization_at ||
          node.runtime?.latest_run_started_at ||
          (node.runtime?.in_progress_run_ids.length ?? 0) > 0 ||
          (node.runtime?.unstarted_run_ids.length ?? 0) > 0
        )

      return matchesQuery && matchesType && matchesRuntime
    }

    const matchedNodes = graph.nodes.filter(matchesFilters)
    const visibleIds = new Set(matchedNodes.map((n) => n.id))

    const containmentEdges = graph.edges.filter(
      (edge) =>
        edge.edge_type === "contains" &&
        visibleIds.has(edge.source) &&
        visibleIds.has(edge.target),
    )
    const visibleEdges = graph.edges.filter((edge) => {
      if (!includeContains && edge.edge_type === "contains") return false
      return visibleIds.has(edge.source) && visibleIds.has(edge.target)
    })

    // When a node-type filter is active every matched node is shown regardless
    // of whether it has edges to other visible nodes — the user explicitly asked
    // to see all nodes of that type.  For text/runtime-only filters we keep the
    // previous behaviour of pruning isolated nodes to reduce clutter, but we
    // always keep the root node.
    let finalNodes: ApiLineageNode[]
    if (enforceNodeTypes) {
      finalNodes = matchedNodes
    } else {
      const keptContainmentAncestors = new Set<string>()
      let changed = true
      while (changed) {
        changed = false
        for (const edge of graph.edges) {
          if (edge.edge_type !== "contains") continue
          if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target))
            continue
          if (
            visibleIds.has(edge.target) ||
            keptContainmentAncestors.has(edge.target)
          ) {
            if (!keptContainmentAncestors.has(edge.source)) {
              keptContainmentAncestors.add(edge.source)
              changed = true
            }
          }
        }
      }

      const connectedIds = new Set<string>()
      for (const edge of visibleEdges) {
        connectedIds.add(edge.source)
        connectedIds.add(edge.target)
      }
      if (graph.root?.id) connectedIds.add(graph.root.id)

      finalNodes =
        visibleEdges.length === 0
          ? matchedNodes
          : matchedNodes.filter(
              (node) =>
                connectedIds.has(node.id) ||
                keptContainmentAncestors.has(node.id),
            )
    }

    return {
      ...graph,
      nodes: finalNodes,
      edges: visibleEdges,
      containmentEdges,
      root:
        graph.root && finalNodes.some((node) => node.id === graph.root?.id)
          ? graph.root
          : null,
    }
  }, [filters, graph])

  const focusedGraph = useMemo<LineageGraphView | null>(() => {
    if (!filteredGraph || !enableNeighborhoodSelection || !selectedNodeId) {
      return filteredGraph
    }

    const selectedExists = filteredGraph.nodes.some(
      (node) => node.id === selectedNodeId,
    )
    if (!selectedExists) return filteredGraph

    const expansionSeeds = new Set<string>([
      selectedNodeId,
      ...expandedNodeIds.filter((nodeId) =>
        filteredGraph.nodes.some((node) => node.id === nodeId),
      ),
    ])
    const focusedEdges = filteredGraph.edges.filter(
      (edge) =>
        expansionSeeds.has(edge.source) || expansionSeeds.has(edge.target),
    )
    const focusedIds = new Set<string>([selectedNodeId])
    for (const edge of focusedEdges) {
      focusedIds.add(edge.source)
      focusedIds.add(edge.target)
    }

    const focusedNodes = filteredGraph.nodes.filter((node) =>
      focusedIds.has(node.id),
    )
    const focusedRoot =
      filteredGraph.root && focusedIds.has(filteredGraph.root.id)
        ? filteredGraph.root
        : (filteredGraph.nodes.find((node) => node.id === selectedNodeId) ??
          null)

    return {
      ...filteredGraph,
      nodes: focusedNodes,
      edges: focusedEdges,
      containmentEdges: filteredGraph.containmentEdges.filter(
        (edge) => focusedIds.has(edge.source) && focusedIds.has(edge.target),
      ),
      root: focusedRoot,
    }
  }, [
    enableNeighborhoodSelection,
    expandedNodeIds,
    filteredGraph,
    selectedNodeId,
  ])

  const currentId =
    enableNeighborhoodSelection && selectedNodeId
      ? selectedNodeId
      : (focusedGraph?.root?.id ?? null)
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!focusedGraph) {
      return { rfNodes: [] as LineageFlowNode[], rfEdges: [] as Edge[] }
    }

    const expandedIds = new Set(expandedNodeIds)
    const graphForLayout = {
      ...focusedGraph,
      nodes: focusedGraph.nodes.map((node) => ({
        ...node,
        properties: {
          ...node.properties,
          __disableLink: enableNeighborhoodSelection,
          __canExpand:
            enableNeighborhoodSelection &&
            !!selectedNodeId &&
            node.id !== selectedNodeId,
        },
      })),
    } satisfies ApiLineageGraph
    const layout = buildLayout(
      graphForLayout,
      focusedGraph.containmentEdges,
      currentId,
    )

    return {
      rfNodes: layout.rfNodes.map((node): LineageFlowNode => {
        if (node.type !== "lineageCard") {
          return node
        }

        const data: LineageNodeData = {
          ...node.data,
          canExpand:
            enableNeighborhoodSelection &&
            !!selectedNodeId &&
            node.id !== selectedNodeId,
          isExpanded: expandedIds.has(node.id),
          onExpand: enableNeighborhoodSelection
            ? (nodeId: string) => {
                setExpandedNodeIds((current) =>
                  current.includes(nodeId)
                    ? current.filter((value) => value !== nodeId)
                    : [...current, nodeId],
                )
              }
            : null,
        }

        return {
          ...node,
          data,
        }
      }),
      rfEdges: layout.rfEdges,
    }
  }, [
    currentId,
    enableNeighborhoodSelection,
    expandedNodeIds,
    focusedGraph,
    selectedNodeId,
  ])

  const [nodes, setNodes, onNodesChange] =
    useNodesState<LineageFlowNode>(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<
    LineageFlowNode,
    Edge
  > | null>(null)

  useEffect(() => {
    setNodes(rfNodes)
    if (rfInstance && rfNodes.length > 0) {
      setTimeout(() => rfInstance.fitView({ padding: 0.08, minZoom: 0.5 }), 0)
    }
  }, [rfNodes, setNodes, rfInstance])
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

  if (!focusedGraph || focusedGraph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No lineage matches the current filters
      </div>
    )
  }

  return (
    <ReactFlow<LineageFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        if (!enableNeighborhoodSelection) return
        setSelectedNodeId((current) => {
          const nextId = current === node.id ? null : node.id
          setExpandedNodeIds([])
          return nextId
        })
      }}
      onPaneClick={() => {
        if (!enableNeighborhoodSelection) return
        setSelectedNodeId(null)
        setExpandedNodeIds([])
      }}
      nodeTypes={nodeTypes}
      onInit={setRfInstance}
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
