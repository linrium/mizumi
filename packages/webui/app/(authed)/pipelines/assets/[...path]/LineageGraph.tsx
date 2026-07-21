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
  if (!ts) {
    return null
  }
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
    if (catalog && schema) {
      return `${catalog}.${schema}`
    }
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
        "select-none overflow-hidden rounded-lg border-2 bg-white text-xs shadow-sm",
        nodeAccent(data.nodeType),
        data.isCurrent ? "border-blue-500 ring-2 ring-blue-500" : ""
      )}
    >
      <Handle
        className="!w-2 !h-2 !bg-zinc-300 !border-0"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="!w-2 !h-2 !bg-zinc-300 !border-0"
        position={Position.Right}
        type="source"
      />

      <div className="flex items-start gap-2 border-zinc-200/80 border-b px-3 py-2">
        <span className="mt-0.5 shrink-0 text-zinc-500">
          {nodeIcon(data.nodeType)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="whitespace-normal break-words font-mono font-semibold leading-snug">
            {data.displayName}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500 uppercase tracking-wide">
            {data.nodeType.replaceAll("_", " ")}
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-200/70">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-zinc-500">Platform</span>
          <span className="text-zinc-700 capitalize">{data.platform}</span>
        </div>
        <div className="flex items-start justify-between gap-2 px-3 py-1.5">
          <span className="shrink-0 text-zinc-500">Scope</span>
          <span className="break-words text-right text-zinc-700">
            {typeLabel({
              display_name: data.displayName,
              id: data.id,
              name: "",
              namespace: "",
              node_type: data.nodeType,
              platform: data.platform,
              properties: data.properties,
              runtime: data.runtime,
            } as ApiLineageNode)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-zinc-500">Latest event</span>
          <span
            className={latest ? "font-medium text-blue-600" : "text-zinc-400"}
          >
            {fmtRelTime(latest)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5">
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
                    : "text-zinc-400"
            )}
          >
            {isActive ? "Active" : (runtime?.latest_run_status ?? "—")}
          </span>
        </div>
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1.5",
            latest ? "bg-green-50/70" : ""
          )}
        >
          <span
            className={latest ? "font-medium text-green-700" : "text-zinc-500"}
          >
            {latest ? "Observed" : "No runtime"}
          </span>
          <span className={latest ? "text-green-700" : "text-zinc-400"}>
            {fmtAbsTime(latest)}
          </span>
        </div>
        {data.canExpand && (
          <div className="flex justify-end bg-white/80 px-3 py-2">
            <button
              className={cn(
                "rounded-md border px-2 py-1 font-medium text-[10px] uppercase tracking-wide transition-colors",
                data.isExpanded
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
              )}
              onClick={(event) => {
                event.stopPropagation()
                data.onExpand?.(data.id)
              }}
              type="button"
            >
              {data.isExpanded ? "Expanded" : "Expand"}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  if (!data.href) {
    return body
  }

  return (
    <Link
      className="block transition-opacity hover:opacity-90"
      href={data.href}
    >
      {body}
    </Link>
  )
}

function groupAccent(nodeType: "catalog" | "schema", isCurrent: boolean) {
  if (nodeType === "catalog") {
    return cn(
      "border-amber-400/80 bg-amber-100/70",
      isCurrent ? "border-amber-500 ring-2 ring-amber-500" : ""
    )
  }
  return cn(
    "border-sky-400/75 bg-sky-100/70",
    isCurrent ? "border-sky-500 ring-2 ring-sky-500" : ""
  )
}

function LineageGroupNode({ data }: { data: LineageGroupData }) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-2xl border-2 border-dashed px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
        groupAccent(data.nodeType, data.isCurrent)
      )}
    >
      <div className="flex items-center gap-2 text-zinc-700">
        <span className="text-sm">{nodeIcon(data.nodeType)}</span>
        <div className="min-w-0">
          <div className="truncate font-mono font-semibold text-[11px] uppercase tracking-[0.16em]">
            {data.displayName}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
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
  rects: Array<{ x: number; y: number; width: number; height: number }>
) {
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  }
}

function buildLayout(
  graph: ApiLineageGraph,
  containmentEdges: ApiLineageEdge[],
  currentId: string | null
): { rfNodes: LineageFlowNode[]; rfEdges: Edge[] } {
  const containsEdges = containmentEdges
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const groupedNodes = graph.nodes.filter((node) =>
    isGroupNodeType(node.node_type)
  )
  const leafNodes = graph.nodes.filter(
    (node) => !isGroupNodeType(node.node_type)
  )
  const groupedNodeIds = new Set(groupedNodes.map((node) => node.id))
  const leafNodeIds = new Set(leafNodes.map((node) => node.id))
  const schemaChildren = new Map<string, string[]>()
  const catalogChildren = new Map<string, string[]>()
  for (const edge of containsEdges) {
    const sourceNode = nodesById.get(edge.source)
    const targetNode = nodesById.get(edge.target)
    if (!(sourceNode && targetNode)) {
      continue
    }

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
  g.setGraph({ nodesep: 30, rankdir: "LR", ranksep: 90 })

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
      height: cardHeight(node) + extraTop + extraBottom,
      width: CARD_W,
    })
    if (schemaId) {
      g.setParent(node.id, schemaId)
    }
  }

  for (const schemaNode of groupedNodes.filter(
    (node) => node.node_type === "schema"
  )) {
    const hasChildren = (schemaChildren.get(schemaNode.id) ?? []).length > 0
    if (hasChildren) {
      // Compound parent — size derived from children.
      g.setNode(schemaNode.id, {})
    } else {
      // Fallback standalone group with explicit size.
      g.setNode(schemaNode.id, { height: GROUP_MIN_H, width: GROUP_MIN_W })
    }
    const catalogId = catalogForSchema.get(schemaNode.id)
    if (catalogId) {
      g.setParent(schemaNode.id, catalogId)
    }
  }

  for (const catalogNode of groupedNodes.filter(
    (node) => node.node_type === "catalog"
  )) {
    const hasChildSchemas =
      (catalogChildren.get(catalogNode.id) ?? []).length > 0
    if (hasChildSchemas) {
      g.setNode(catalogNode.id, {})
    } else {
      g.setNode(catalogNode.id, {
        height: GROUP_MIN_H,
        width: GROUP_MIN_W + 40,
      })
    }
  }

  for (const edge of graph.edges) {
    if (edge.edge_type === "contains") {
      continue
    }
    if (!(nodesById.has(edge.source) && nodesById.has(edge.target))) {
      continue
    }
    if (isGroupNodeType(nodesById.get(edge.source)?.node_type ?? "")) {
      continue
    }
    if (isGroupNodeType(nodesById.get(edge.target)?.node_type ?? "")) {
      continue
    }
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
      height,
      width: CARD_W,
      x: (pos?.x ?? 0) - CARD_W / 2,
      y: centerY - height / 2,
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
    (node) => node.node_type === "schema"
  )) {
    const childIds = schemaChildren.get(schemaNode.id) ?? []
    const childRects = childIds
      .map((id) => leafAbsRects.get(id))
      .filter(
        (
          rect
        ): rect is { x: number; y: number; width: number; height: number } =>
          !!rect
      )

    if (childRects.length === 0) {
      const pos = g.node(schemaNode.id)
      const width = pos?.width ?? GROUP_MIN_W
      const height = pos?.height ?? GROUP_MIN_H
      schemaRects.set(schemaNode.id, {
        height,
        width,
        x: (pos?.x ?? 0) - width / 2,
        y: (pos?.y ?? 0) - height / 2,
      })
      continue
    }

    const bounds = boundsFromRects(childRects)
    schemaRects.set(schemaNode.id, {
      height: Math.max(
        bounds.height + GROUP_HEADER_H + GROUP_PAD_Y * 2,
        GROUP_MIN_H
      ),
      width: Math.max(bounds.width + GROUP_PAD_X * 2, GROUP_MIN_W),
      x: bounds.x - GROUP_PAD_X,
      y: bounds.y - GROUP_HEADER_H - GROUP_PAD_Y,
    })
  }

  // Catalog rects: tight bounds around contained schemas + header/padding.
  const catalogRects = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >()
  for (const catalogNode of groupedNodes.filter(
    (node) => node.node_type === "catalog"
  )) {
    const childSchemaIds = catalogChildren.get(catalogNode.id) ?? []
    const childRects = childSchemaIds
      .map((id) => schemaRects.get(id))
      .filter(
        (
          rect
        ): rect is { x: number; y: number; width: number; height: number } =>
          !!rect
      )

    if (childRects.length === 0) {
      const pos = g.node(catalogNode.id)
      const width = pos?.width ?? GROUP_MIN_W + 40
      const height = pos?.height ?? GROUP_MIN_H
      catalogRects.set(catalogNode.id, {
        height,
        width,
        x: (pos?.x ?? 0) - width / 2,
        y: (pos?.y ?? 0) - height / 2,
      })
      continue
    }

    const bounds = boundsFromRects(childRects)
    catalogRects.set(catalogNode.id, {
      height: Math.max(
        bounds.height + GROUP_HEADER_H + GROUP_PAD_Y * 2,
        GROUP_MIN_H + 20
      ),
      width: Math.max(bounds.width + GROUP_PAD_X * 2, GROUP_MIN_W + 40),
      x: bounds.x - GROUP_PAD_X,
      y: bounds.y - GROUP_HEADER_H - GROUP_PAD_Y,
    })
  }

  // Assemble React Flow nodes. Catalogs first (lowest z-index), then schemas
  // (positioned relative to their catalog if any), then leaves (positioned
  // relative to their schema if any).
  const rfNodes: LineageFlowNode[] = []

  for (const catalogNode of groupedNodes.filter(
    (node) => node.node_type === "catalog"
  )) {
    const rect = catalogRects.get(catalogNode.id)
    if (!rect) {
      continue
    }
    rfNodes.push({
      data: {
        displayName: catalogNode.display_name,
        id: catalogNode.id,
        isCurrent: catalogNode.id === currentId,
        nodeType: "catalog",
      },
      draggable: false,
      id: catalogNode.id,
      position: { x: rect.x, y: rect.y },
      selectable: true,
      style: { height: rect.height, width: rect.width, zIndex: -2 },
      type: "lineageGroup",
    })
  }

  for (const schemaNode of groupedNodes.filter(
    (node) => node.node_type === "schema"
  )) {
    const rect = schemaRects.get(schemaNode.id)
    if (!rect) {
      continue
    }
    const catalogId = catalogForSchema.get(schemaNode.id)
    const catalogRect = catalogId ? catalogRects.get(catalogId) : undefined
    const schemaFlow: Node<LineageGroupData, "lineageGroup"> = {
      data: {
        displayName: schemaNode.display_name,
        id: schemaNode.id,
        isCurrent: schemaNode.id === currentId,
        nodeType: "schema",
      },
      draggable: false,
      id: schemaNode.id,
      position: catalogRect
        ? { x: rect.x - catalogRect.x, y: rect.y - catalogRect.y }
        : { x: rect.x, y: rect.y },
      selectable: true,
      style: { height: rect.height, width: rect.width, zIndex: -1 },
      type: "lineageGroup",
    }
    if (catalogRect) {
      schemaFlow.parentId = catalogId
      schemaFlow.extent = "parent"
    }
    rfNodes.push(schemaFlow)
  }

  for (const node of leafNodes) {
    const absRect = leafAbsRects.get(node.id)
    if (!absRect) {
      continue
    }
    const schemaId = schemaForLeaf.get(node.id)
    const schemaRect = schemaId ? schemaRects.get(schemaId) : undefined
    const leafFlow: Node<LineageNodeData, "lineageCard"> = {
      data: {
        canExpand: false,
        displayName: node.display_name,
        href: nodeHref(node),
        id: node.id,
        isCurrent: node.id === currentId,
        isExpanded: false,
        nodeType: node.node_type,
        onExpand: null,
        platform: node.platform,
        properties: node.properties,
        runtime: node.runtime,
      } satisfies LineageNodeData,
      draggable: false,
      id: node.id,
      position: schemaRect
        ? { x: absRect.x - schemaRect.x, y: absRect.y - schemaRect.y }
        : { x: absRect.x, y: absRect.y },
      style: { height: absRect.height, width: CARD_W },
      type: "lineageCard",
    }
    if (schemaRect) {
      leafFlow.parentId = schemaId
      leafFlow.extent = "parent"
    }
    rfNodes.push(leafFlow)
  }

  const rfEdges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    label: edge.edge_type.replaceAll("_", " "),
    labelBgBorderRadius: 4,
    labelBgPadding: [4, 2],
    labelBgStyle: { fill: "rgba(255,255,255,0.9)" },
    labelStyle: {
      fill: "#64748b",
      fontSize: 10,
      textTransform: "capitalize",
    },
    markerEnd: {
      color: "#94a3b8",
      height: 14,
      type: MarkerType.ArrowClosed,
      width: 14,
    },
    source: edge.source,
    style: {
      stroke: "#94a3b8",
      strokeDasharray: edge.edge_type === "contains" ? "4 4" : undefined,
      strokeWidth: edge.edge_type === "contains" ? 1 : 1.6,
    },
    target: edge.target,
  }))

  return { rfEdges, rfNodes }
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
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`)
        }
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
                    n.name === selectRootHint.displayName)
              )
              if (match) {
                setSelectedNodeId(match.id)
              }
            }
          }
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [rootToken, neighborhoodOnly, selectRoot, selectRootHint, initialDepth])

  const filteredGraph = useMemo<LineageGraphView | null>(() => {
    if (!graph) {
      return null
    }

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
        visibleIds.has(edge.target)
    )
    const visibleEdges = graph.edges.filter((edge) => {
      if (!includeContains && edge.edge_type === "contains") {
        return false
      }
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
          if (edge.edge_type !== "contains") {
            continue
          }
          if (!(visibleIds.has(edge.source) && visibleIds.has(edge.target))) {
            continue
          }
          if (
            (visibleIds.has(edge.target) ||
              keptContainmentAncestors.has(edge.target)) &&
            !keptContainmentAncestors.has(edge.source)
          ) {
            keptContainmentAncestors.add(edge.source)
            changed = true
          }
        }
      }

      const connectedIds = new Set<string>()
      for (const edge of visibleEdges) {
        connectedIds.add(edge.source)
        connectedIds.add(edge.target)
      }
      if (graph.root?.id) {
        connectedIds.add(graph.root.id)
      }

      finalNodes =
        visibleEdges.length === 0
          ? matchedNodes
          : matchedNodes.filter(
              (node) =>
                connectedIds.has(node.id) ||
                keptContainmentAncestors.has(node.id)
            )
    }

    return {
      ...graph,
      containmentEdges,
      edges: visibleEdges,
      nodes: finalNodes,
      root:
        graph.root && finalNodes.some((node) => node.id === graph.root?.id)
          ? graph.root
          : null,
    }
  }, [filters, graph])

  const focusedGraph = useMemo<LineageGraphView | null>(() => {
    if (!(filteredGraph && enableNeighborhoodSelection && selectedNodeId)) {
      return filteredGraph
    }

    const selectedExists = filteredGraph.nodes.some(
      (node) => node.id === selectedNodeId
    )
    if (!selectedExists) {
      return filteredGraph
    }

    const expansionSeeds = new Set<string>([
      selectedNodeId,
      ...expandedNodeIds.filter((nodeId) =>
        filteredGraph.nodes.some((node) => node.id === nodeId)
      ),
    ])
    const focusedEdges = filteredGraph.edges.filter(
      (edge) =>
        expansionSeeds.has(edge.source) || expansionSeeds.has(edge.target)
    )
    const focusedIds = new Set<string>([selectedNodeId])
    for (const edge of focusedEdges) {
      focusedIds.add(edge.source)
      focusedIds.add(edge.target)
    }

    const focusedNodes = filteredGraph.nodes.filter((node) =>
      focusedIds.has(node.id)
    )
    const focusedRoot =
      filteredGraph.root && focusedIds.has(filteredGraph.root.id)
        ? filteredGraph.root
        : (filteredGraph.nodes.find((node) => node.id === selectedNodeId) ??
          null)

    return {
      ...filteredGraph,
      containmentEdges: filteredGraph.containmentEdges.filter(
        (edge) => focusedIds.has(edge.source) && focusedIds.has(edge.target)
      ),
      edges: focusedEdges,
      nodes: focusedNodes,
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
      return { rfEdges: [] as Edge[], rfNodes: [] as LineageFlowNode[] }
    }

    const expandedIds = new Set(expandedNodeIds)
    const graphForLayout = {
      ...focusedGraph,
      nodes: focusedGraph.nodes.map((node) => ({
        ...node,
        properties: {
          ...node.properties,
          __canExpand:
            enableNeighborhoodSelection &&
            !!selectedNodeId &&
            node.id !== selectedNodeId,
          __disableLink: enableNeighborhoodSelection,
        },
      })),
    } satisfies ApiLineageGraph
    const layout = buildLayout(
      graphForLayout,
      focusedGraph.containmentEdges,
      currentId
    )

    return {
      rfEdges: layout.rfEdges,
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
                    : [...current, nodeId]
                )
              }
            : null,
        }

        return {
          ...node,
          data,
        }
      }),
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
      setTimeout(() => rfInstance.fitView({ minZoom: 0.5, padding: 0.08 }), 0)
    }
  }, [rfNodes, setNodes, rfInstance])
  useEffect(() => {
    setEdges(rfEdges)
  }, [rfEdges, setEdges])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading lineage…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center font-mono text-destructive text-sm">
        {error}
      </div>
    )
  }

  if (!focusedGraph || focusedGraph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No lineage matches the current filters
      </div>
    )
  }

  return (
    <ReactFlow<LineageFlowNode, Edge>
      edges={edges}
      elementsSelectable
      maxZoom={2}
      minZoom={0.1}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodeTypes={nodeTypes}
      onEdgesChange={onEdgesChange}
      onInit={setRfInstance}
      onNodeClick={(_, node) => {
        if (!enableNeighborhoodSelection) {
          return
        }
        setSelectedNodeId((current) => {
          const nextId = current === node.id ? null : node.id
          setExpandedNodeIds([])
          return nextId
        })
      }}
      onNodesChange={onNodesChange}
      onPaneClick={() => {
        if (!enableNeighborhoodSelection) {
          return
        }
        setSelectedNodeId(null)
        setExpandedNodeIds([])
      }}
    >
      <Background
        color="rgba(0,0,0,0.07)"
        gap={20}
        size={1}
        variant={BackgroundVariant.Dots}
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
