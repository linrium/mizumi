"use client";

import dagre from "@dagrejs/dagre";
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
} from "@xyflow/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import { apiFetch as fetchWithAuth } from "@/lib/api-client";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

type RuntimeInfo = {
  source_system: string;
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_run_started_at: string | null;
  latest_run_ended_at: string | null;
  latest_materialization_at: string | null;
  latest_materialization_run_id: string | null;
  unstarted_run_ids: string[];
  in_progress_run_ids: string[];
  metadata: Record<string, unknown>;
  observed_at: string;
};

type ApiLineageNode = {
  id: string;
  node_type: string;
  platform: string;
  namespace: string;
  name: string;
  display_name: string;
  properties: Record<string, unknown>;
  runtime: RuntimeInfo | null;
};

type ApiLineageEdge = {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  confidence: number;
  properties: Record<string, unknown>;
};

type ApiLineageGraph = {
  root: ApiLineageNode | null;
  direction: string;
  depth: number;
  nodes: ApiLineageNode[];
  edges: ApiLineageEdge[];
};

export type LineageFilters = {
  query?: string;
  nodeTypes?: string[];
  runtimeOnly?: boolean;
  includeContains?: boolean;
};

type LineageNodeData = {
  id: string;
  displayName: string;
  nodeType: string;
  platform: string;
  properties: Record<string, unknown>;
  runtime: RuntimeInfo | null;
  isCurrent: boolean;
  href: string | null;
  canExpand: boolean;
  isExpanded: boolean;
  onExpand: ((id: string) => void) | null;
  [key: string]: unknown;
};

function toDayjs(ts: string | null | undefined) {
  if (!ts) return null;
  const d = dayjs(ts);
  return d.isValid() ? d : null;
}

function fmtRelTime(ts: string | null | undefined) {
  const d = toDayjs(ts);
  return d ? d.fromNow() : "—";
}

function fmtAbsTime(ts: string | null | undefined) {
  const d = toDayjs(ts);
  return d ? d.format("MMM D, h:mm A") : "—";
}

function nodeAccent(nodeType: string) {
  switch (nodeType) {
    case "table":
      return "border-emerald-300 bg-emerald-50/60";
    case "topic":
      return "border-amber-300 bg-amber-50/60";
    case "dagster_asset":
      return "border-sky-300 bg-sky-50/60";
    case "spark_job":
    case "streaming_job":
    case "daft_job":
    case "dagster_job":
      return "border-rose-300 bg-rose-50/60";
    case "schedule":
      return "border-violet-300 bg-violet-50/60";
    case "catalog":
    case "schema":
      return "border-zinc-300 bg-zinc-50/60";
    default:
      return "border-zinc-200 bg-white";
  }
}

function nodeIcon(nodeType: string) {
  switch (nodeType) {
    case "table":
      return "▦";
    case "topic":
      return "◉";
    case "dagster_asset":
      return "◫";
    case "spark_job":
    case "streaming_job":
      return "⚙";
    case "daft_job":
      return "◇";
    case "dagster_job":
      return "▸";
    case "schedule":
      return "◷";
    case "catalog":
      return "▤";
    case "schema":
      return "⋮";
    default:
      return "•";
  }
}

function latestTimestamp(runtime: RuntimeInfo | null) {
  return (
    runtime?.latest_materialization_at ?? runtime?.latest_run_started_at ?? null
  );
}

function nodeHref(node: ApiLineageNode) {
  if (node.properties.__disableLink) {
    return null;
  }
  if (node.node_type === "dagster_asset") {
    return `/pipelines/assets/${node.name}`;
  }
  return null;
}

function typeLabel(node: ApiLineageNode) {
  if (node.node_type === "table") {
    const catalog = String(node.properties.catalog_name ?? "");
    const schema = String(node.properties.schema_name ?? "");
    if (catalog && schema) return `${catalog}.${schema}`;
  }
  return node.platform;
}

function LineageNodeCard({ data }: { data: LineageNodeData }) {
  const runtime = data.runtime;
  const isActive =
    (runtime?.in_progress_run_ids.length ?? 0) > 0 ||
    (runtime?.unstarted_run_ids.length ?? 0) > 0;
  const latest = latestTimestamp(runtime);

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
                event.stopPropagation();
                data.onExpand?.(data.id);
              }}
            >
              {data.isExpanded ? "Expanded" : "Expand"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!data.href) return body;

  return (
    <Link
      href={data.href}
      className="block hover:opacity-90 transition-opacity"
    >
      {body}
    </Link>
  );
}

const nodeTypes: NodeTypes = {
  lineageCard: LineageNodeCard as NodeTypes[string],
};

const CARD_W = 290;
const BASE_CARD_H = 190;
const EXPANDABLE_CARD_H = 228;

function cardHeight(node: ApiLineageNode) {
  return node.properties.__canExpand ? EXPANDABLE_CARD_H : BASE_CARD_H;
}

function buildLayout(
  graph: ApiLineageGraph,
  currentId: string | null,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 90 });

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: CARD_W, height: cardHeight(node) });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const rfNodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    const height = cardHeight(node);
    return {
      id: node.id,
      type: "lineageCard",
      position: {
        x: pos.x - CARD_W / 2,
        y: pos.y - height / 2,
      },
      style: { width: CARD_W, height },
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
    };
  });

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
  }));

  return { rfNodes, rfEdges };
}

export function LineageGraph({
  currentPath,
  neighborhoodOnly = false,
  enableNeighborhoodSelection = false,
  filters,
}: {
  currentPath?: string[];
  neighborhoodOnly?: boolean;
  enableNeighborhoodSelection?: boolean;
  filters?: LineageFilters;
}) {
  const rootToken = currentPath?.join("/") ?? null;

  const [graph, setGraph] = useState<ApiLineageGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (rootToken) {
      params.set("root", rootToken);
    }
    params.set("direction", "both");
    params.set("depth", neighborhoodOnly ? "2" : "6");

    fetchWithAuth(`/api/lineage/graph?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        return json as ApiLineageGraph;
      })
      .then((data) => {
        if (!cancelled) setGraph(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rootToken, neighborhoodOnly]);

  const filteredGraph = useMemo(() => {
    if (!graph) return null;

    const query = filters?.query?.trim().toLowerCase() ?? "";
    const allowedNodeTypes = new Set(filters?.nodeTypes ?? []);
    const enforceNodeTypes = allowedNodeTypes.size > 0;
    const includeContains = filters?.includeContains ?? true;
    const runtimeOnly = filters?.runtimeOnly ?? false;

    const visibleNodes = graph.nodes.filter((node) => {
      const matchesQuery =
        query.length === 0 ||
        node.display_name.toLowerCase().includes(query) ||
        node.name.toLowerCase().includes(query) ||
        node.node_type.toLowerCase().includes(query) ||
        node.platform.toLowerCase().includes(query);

      const matchesType =
        !enforceNodeTypes || allowedNodeTypes.has(node.node_type);

      const matchesRuntime =
        !runtimeOnly ||
        !!(
          node.runtime?.latest_materialization_at ||
          node.runtime?.latest_run_started_at ||
          (node.runtime?.in_progress_run_ids.length ?? 0) > 0 ||
          (node.runtime?.unstarted_run_ids.length ?? 0) > 0
        );

      return matchesQuery && matchesType && matchesRuntime;
    });

    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = graph.edges.filter((edge) => {
      if (!includeContains && edge.edge_type === "contains") return false;
      return visibleIds.has(edge.source) && visibleIds.has(edge.target);
    });

    const connectedIds = new Set<string>();
    for (const edge of visibleEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    for (const node of visibleNodes) {
      if (node.id === graph.root?.id) connectedIds.add(node.id);
    }

    const finalNodes =
      visibleEdges.length === 0
        ? visibleNodes
        : visibleNodes.filter((node) => connectedIds.has(node.id));

    return {
      ...graph,
      nodes: finalNodes,
      edges: visibleEdges,
      root:
        graph.root && finalNodes.some((node) => node.id === graph.root?.id)
          ? graph.root
          : null,
    } satisfies ApiLineageGraph;
  }, [filters, graph]);

  const focusedGraph = useMemo(() => {
    if (!filteredGraph || !enableNeighborhoodSelection || !selectedNodeId) {
      return filteredGraph;
    }

    const selectedExists = filteredGraph.nodes.some(
      (node) => node.id === selectedNodeId,
    );
    if (!selectedExists) return filteredGraph;

    const expansionSeeds = new Set<string>([
      selectedNodeId,
      ...expandedNodeIds.filter((nodeId) =>
        filteredGraph.nodes.some((node) => node.id === nodeId),
      ),
    ]);
    const focusedEdges = filteredGraph.edges.filter(
      (edge) =>
        expansionSeeds.has(edge.source) || expansionSeeds.has(edge.target),
    );
    const focusedIds = new Set<string>([selectedNodeId]);
    for (const edge of focusedEdges) {
      focusedIds.add(edge.source);
      focusedIds.add(edge.target);
    }

    const focusedNodes = filteredGraph.nodes.filter((node) =>
      focusedIds.has(node.id),
    );
    const focusedRoot =
      filteredGraph.root && focusedIds.has(filteredGraph.root.id)
        ? filteredGraph.root
        : (filteredGraph.nodes.find((node) => node.id === selectedNodeId) ??
          null);

    return {
      ...filteredGraph,
      nodes: focusedNodes,
      edges: focusedEdges,
      root: focusedRoot,
    } satisfies ApiLineageGraph;
  }, [
    enableNeighborhoodSelection,
    expandedNodeIds,
    filteredGraph,
    selectedNodeId,
  ]);

  const currentId =
    enableNeighborhoodSelection && selectedNodeId
      ? selectedNodeId
      : (focusedGraph?.root?.id ?? null);
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!focusedGraph) return { rfNodes: [], rfEdges: [] };

    const expandedIds = new Set(expandedNodeIds);
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
    } satisfies ApiLineageGraph;
    const layout = buildLayout(graphForLayout, currentId);

    return {
      rfNodes: layout.rfNodes.map((node) => ({
        ...node,
        data: {
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
                );
              }
            : null,
        } satisfies LineageNodeData,
      })),
      rfEdges: layout.rfEdges,
    };
  }, [
    currentId,
    enableNeighborhoodSelection,
    expandedNodeIds,
    focusedGraph,
    selectedNodeId,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    setNodes(rfNodes);
    if (rfInstance && rfNodes.length > 0) {
      setTimeout(() => rfInstance.fitView({ padding: 0.08, minZoom: 0.5 }), 0);
    }
  }, [rfNodes, setNodes, rfInstance]);
  useEffect(() => {
    setEdges(rfEdges);
  }, [rfEdges, setEdges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading lineage…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-destructive font-mono px-6 text-center">
        {error}
      </div>
    );
  }

  if (!focusedGraph || focusedGraph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No lineage matches the current filters
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        if (!enableNeighborhoodSelection) return;
        setSelectedNodeId((current) => {
          const nextId = current === node.id ? null : node.id;
          setExpandedNodeIds([]);
          return nextId;
        });
      }}
      onPaneClick={() => {
        if (!enableNeighborhoodSelection) return;
        setSelectedNodeId(null);
        setExpandedNodeIds([]);
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
  );
}
