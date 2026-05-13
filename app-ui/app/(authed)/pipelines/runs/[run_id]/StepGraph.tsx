'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RunEvent = {
  type: string
  timestamp: string | null
  message: string | null
  level: string | null
  step_key: string | null
  error: string | null
  asset_key: string[] | null
  label: string | null
  description: string | null
}

type StepStatus = 'success' | 'failure' | 'running' | 'skipped' | 'pending'

type StepInfo = {
  key: string
  status: StepStatus
  startTime: number | null
  endTime: number | null
  upstream: string[]
}

// ── Derive step statuses from events ─────────────────────────────────────────

function deriveSteps(events: RunEvent[]): StepInfo[] {
  const steps = new Map<string, StepInfo>()

  const ensure = (key: string) => {
    if (!steps.has(key)) {
      steps.set(key, { key, status: 'pending', startTime: null, endTime: null, upstream: [] })
    }
    return steps.get(key)!
  }

  for (const e of events) {
    const key = e.step_key
    if (!key) continue
    const s = ensure(key)
    const ts = e.timestamp ? Number(e.timestamp) / 1000 : null

    switch (e.type) {
      case 'ExecutionStepStartEvent':
        s.status = 'running'
        if (ts) s.startTime = ts
        break
      case 'ExecutionStepSuccessEvent':
        s.status = 'success'
        if (ts) s.endTime = ts
        break
      case 'ExecutionStepFailureEvent':
        s.status = 'failure'
        if (ts) s.endTime = ts
        break
      case 'ExecutionStepSkippedEvent':
        s.status = 'skipped'
        break
      case 'ExecutionStepUpForRetryEvent':
        s.status = 'running'
        break
    }
  }

  return Array.from(steps.values())
}

// ── Node component ────────────────────────────────────────────────────────────

type StepNodeData = {
  info: StepInfo
  selected: boolean
  [key: string]: unknown
}

const STATUS_STYLES: Record<StepStatus, string> = {
  success: 'bg-green-500 text-white border-green-600',
  failure: 'bg-red-500 text-white border-red-600',
  running: 'bg-blue-500 text-white border-blue-600',
  skipped: 'bg-zinc-300 text-zinc-600 border-zinc-400 dark:bg-zinc-700 dark:text-zinc-300',
  pending: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400',
}

function fmtSec(start: number | null, end: number | null): string {
  if (!start) return ''
  const sec = Math.round((end ?? Date.now() / 1000) - start)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function StepNode({ data }: { data: StepNodeData }) {
  const { info } = data
  const dur = fmtSec(info.startTime, info.endTime)
  return (
    <div
      className={cn(
        'rounded px-3 py-1.5 text-xs font-mono font-semibold border shadow-sm min-w-[120px] text-center cursor-default select-none',
        STATUS_STYLES[info.status],
        data.selected && 'ring-2 ring-offset-1 ring-foreground',
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-white/60 !border-0" />
      <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !bg-white/60 !border-0" />
      <div>{info.key}</div>
      {dur && <div className="text-[10px] opacity-75 font-normal mt-0.5">{dur}</div>}
    </div>
  )
}

const nodeTypes: NodeTypes = { step: StepNode as NodeTypes[string] }

// ── Layout ────────────────────────────────────────────────────────────────────

function buildLayout(
  steps: StepInfo[],
  selectedKey: string | null,
): { rfNodes: Node[]; rfEdges: Edge[] } {
  if (steps.length === 0) return { rfNodes: [], rfEdges: [] }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80 })

  for (const s of steps) {
    g.setNode(s.key, { width: 160, height: 48 })
  }
  for (const s of steps) {
    for (const up of s.upstream) {
      if (g.hasNode(up)) g.setEdge(up, s.key)
    }
  }
  dagre.layout(g)

  const rfNodes: Node[] = steps.map((s) => {
    const { x, y } = g.node(s.key)
    return {
      id: s.key,
      type: 'step',
      position: { x: x - 80, y: y - 24 },
      data: { info: s, selected: s.key === selectedKey } satisfies StepNodeData,
      draggable: false,
    }
  })

  const rfEdges: Edge[] = steps.flatMap((s) =>
    s.upstream
      .filter((up) => g.hasNode(up))
      .map((up) => ({
        id: `${up}->${s.key}`,
        source: up,
        target: s.key,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#94a3b8' },
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      }))
  )

  return { rfNodes, rfEdges }
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
  const steps = useMemo(() => deriveSteps(events), [events])
  const { rfNodes, rfEdges } = useMemo(() => buildLayout(steps, selectedKey), [steps, selectedKey])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => { setNodes(rfNodes) }, [rfNodes, setNodes])
  useEffect(() => { setEdges(rfEdges) }, [rfEdges, setEdges])

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No steps yet
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
      onNodeClick={(_, node) => onSelectStep(node.id === selectedKey ? null : node.id)}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(0,0,0,0.07)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
