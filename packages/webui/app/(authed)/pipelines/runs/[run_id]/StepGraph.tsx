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
import { useEffect, useMemo, useState } from "react"
import "@xyflow/react/dist/style.css"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetNodeMinimal {
  dependency_keys: string[][]
  path: string[]
}

export interface RunEvent {
  asset_key: string[] | null
  description: string | null
  error: string | null
  label: string | null
  level: string | null
  message: string | null
  step_key: string | null
  timestamp: string | null
  type: string
}

type StepStatus = "success" | "failure" | "running" | "skipped" | "pending"

interface StepInfo {
  endTime: number | null
  key: string
  startTime: number | null
  status: StepStatus
  upstream: string[]
}

// ── Derive step statuses from events ─────────────────────────────────────────

function deriveSteps(
  events: RunEvent[],
  assetNodes: AssetNodeMinimal[]
): StepInfo[] {
  // Build step ↔ asset key mappings from materialization events
  const stepToAsset = new Map<string, string>()
  const assetToStep = new Map<string, string>()
  for (const e of events) {
    if (e.step_key && e.asset_key && e.asset_key.length > 0) {
      const ak = e.asset_key.join("/")
      stepToAsset.set(e.step_key, ak)
      assetToStep.set(ak, e.step_key)
    }
  }
  const assetByKey = new Map(assetNodes.map((n) => [n.path.join("/"), n]))

  const steps = new Map<string, StepInfo>()

  const ensure = (key: string) => {
    if (!steps.has(key)) {
      steps.set(key, {
        endTime: null,
        key,
        startTime: null,
        status: "pending",
        upstream: [],
      })
    }
    return steps.get(key)!
  }

  for (const e of events) {
    const key = e.step_key
    if (!key) {
      continue
    }
    const s = ensure(key)
    const ts = e.timestamp ? Number(e.timestamp) / 1000 : null

    switch (e.type) {
      case "ExecutionStepStartEvent":
        s.status = "running"
        if (ts) {
          s.startTime = ts
        }
        break
      case "ExecutionStepSuccessEvent":
        s.status = "success"
        if (ts) {
          s.endTime = ts
        }
        break
      case "ExecutionStepFailureEvent":
        s.status = "failure"
        if (ts) {
          s.endTime = ts
        }
        break
      case "ExecutionStepSkippedEvent":
        s.status = "skipped"
        break
      case "ExecutionStepUpForRetryEvent":
        s.status = "running"
        break
    }
  }

  // Populate upstream using asset dependency_keys
  for (const [stepKey, s] of steps) {
    const assetKey = stepToAsset.get(stepKey)
    if (!assetKey) {
      continue
    }
    const asset = assetByKey.get(assetKey)
    if (!asset) {
      continue
    }
    for (const dep of asset.dependency_keys) {
      const upStep = assetToStep.get(dep.join("/"))
      if (upStep && steps.has(upStep)) {
        s.upstream.push(upStep)
      }
    }
    s.upstream = [...new Set(s.upstream)]
  }

  return Array.from(steps.values())
}

// ── Node component ────────────────────────────────────────────────────────────

interface StepNodeData {
  info: StepInfo
  selected: boolean
  [key: string]: unknown
}

const STATUS_STYLES: Record<StepStatus, string> = {
  failure: "bg-red-500 text-white border-red-600",
  pending:
    "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400",
  running: "bg-blue-500 text-white border-blue-600",
  skipped:
    "bg-zinc-300 text-zinc-600 border-zinc-400 dark:bg-zinc-700 dark:text-zinc-300",
  success: "bg-green-500 text-white border-green-600",
}

function fmtSec(start: number | null, end: number | null): string {
  if (!start) {
    return ""
  }
  const sec = Math.round((end ?? Date.now() / 1000) - start)
  if (sec < 60) {
    return `${sec}s`
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function StepNode({ data }: { data: StepNodeData }) {
  const { info } = data
  const dur = fmtSec(info.startTime, info.endTime)
  return (
    <div
      className={cn(
        "min-w-[120px] cursor-default select-none rounded border px-3 py-1.5 text-center font-mono font-semibold text-xs shadow-sm",
        STATUS_STYLES[info.status],
        data.selected && "ring-2 ring-foreground ring-offset-1"
      )}
    >
      <Handle
        className="!w-1.5 !h-1.5 !bg-white/60 !border-0"
        position={Position.Left}
        type="target"
      />
      <Handle
        className="!w-1.5 !h-1.5 !bg-white/60 !border-0"
        position={Position.Right}
        type="source"
      />
      <div className="truncate">{info.key}</div>
      {dur && (
        <div className="mt-0.5 font-normal text-[10px] opacity-75">{dur}</div>
      )}
    </div>
  )
}

const nodeTypes: NodeTypes = { step: StepNode as NodeTypes[string] }

// ── Layout ────────────────────────────────────────────────────────────────────

const NODE_W = 240
const NODE_H = 48

function buildLayout(
  steps: StepInfo[],
  selectedKey: string | null
): { rfNodes: Node[]; rfEdges: Edge[] } {
  if (steps.length === 0) {
    return { rfEdges: [], rfNodes: [] }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ nodesep: 24, rankdir: "LR", ranksep: 60 })

  for (const s of steps) {
    g.setNode(s.key, { height: NODE_H, width: NODE_W })
  }
  for (const s of steps) {
    for (const up of s.upstream) {
      if (g.hasNode(up)) {
        g.setEdge(up, s.key)
      }
    }
  }
  dagre.layout(g)

  const rfNodes: Node[] = steps.map((s) => {
    const { x, y } = g.node(s.key)
    return {
      data: { info: s, selected: s.key === selectedKey } satisfies StepNodeData,
      draggable: false,
      id: s.key,
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      style: { width: NODE_W },
      type: "step",
    }
  })

  const rfEdges: Edge[] = steps.flatMap((s) =>
    s.upstream
      .filter((up) => g.hasNode(up))
      .map((up) => ({
        id: `${up}->${s.key}`,
        markerEnd: {
          color: "#94a3b8",
          height: 12,
          type: MarkerType.ArrowClosed,
          width: 12,
        },
        source: up,
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        target: s.key,
      }))
  )

  return { rfEdges, rfNodes }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function StepGraph({
  events,
  selectedKey,
  onSelectStep,
}: {
  events: RunEvent[]
  selectedKey: string | null
  onSelectStep: (key: string | null) => void
}) {
  const [assetNodes, setAssetNodes] = useState<AssetNodeMinimal[]>([])

  useEffect(() => {
    fetchWithAuth("/api/dagster/asset-nodes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { nodes?: AssetNodeMinimal[] }) => setAssetNodes(d.nodes ?? []))
      .catch(() => {})
  }, [])

  const steps = useMemo(
    () => deriveSteps(events, assetNodes),
    [events, assetNodes]
  )
  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(steps, selectedKey),
    [steps, selectedKey]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  useEffect(() => {
    setNodes(rfNodes)
    if (rfInstance && rfNodes.length > 0) {
      setTimeout(() => rfInstance.fitView({ minZoom: 0.5, padding: 0.08 }), 0)
    }
  }, [rfNodes, setNodes, rfInstance])
  useEffect(() => {
    setEdges(rfEdges)
  }, [rfEdges, setEdges])

  if (steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No steps yet
      </div>
    )
  }

  return (
    <ReactFlow
      edges={edges}
      maxZoom={2}
      minZoom={0.1}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodeTypes={nodeTypes}
      onEdgesChange={onEdgesChange}
      onInit={setRfInstance}
      onNodeClick={(_, node) =>
        onSelectStep(node.id === selectedKey ? null : node.id)
      }
      onNodesChange={onNodesChange}
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
