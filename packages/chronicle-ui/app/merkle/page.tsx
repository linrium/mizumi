"use client"

import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  IconArrowLeft,
  IconCircleCheck,
  IconCircleX,
  IconFingerprint,
  IconGitBranch,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
} from "@tabler/icons-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { JsonCodeViewer } from "@/components/json-code-viewer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LogEntry = {
  index: number
  bundle: string
  body?: string
  body_base64?: string
  json?: Record<string, unknown>
  event_type?: string
  source?: string
  occurred_at?: string
}

type EntriesResponse = {
  entries: LogEntry[]
  has_more: boolean
  limit: number
  offset: number
  query: string
  total: number
}

type EntryProofResponse = {
  index: number
  tree_size: number
  leaf_hash: string
  root_hash: string
  proof: string[]
  verified: boolean
  verification_error?: string
  checkpoint: string
  entry: LogEntry
  checkpoint_verified: boolean
}

type ProofStep = {
  level: number
  siblingHash: string
  siblingSide: "left" | "right"
  pathSide: "left" | "right"
}

type MerkleNodeData = {
  label: string
  hash: string
  caption: string
  tone: "entry" | "path" | "sibling" | "root"
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "0"
}

function compactHash(value: string | undefined, start = 12, end = 8) {
  if (!value) {
    return "Unavailable"
  }
  if (value.length <= start + end + 3) {
    return value
  }
  return `${value.slice(0, start)}...${value.slice(-end)}`
}

function entryLabel(entry: LogEntry) {
  if (entry.event_type) {
    return entry.event_type
  }
  if (entry.body) {
    return entry.body.length > 72 ? `${entry.body.slice(0, 72)}...` : entry.body
  }
  return `Entry ${entry.index}`
}

function displayEntryBody(entry: LogEntry | null) {
  if (!entry) {
    return ""
  }
  if (entry.json) {
    return JSON.stringify(entry.json, null, 2)
  }
  return entry.body || entry.body_base64 || ""
}

function proofSteps(proof: EntryProofResponse | null): ProofStep[] {
  if (!proof) {
    return []
  }

  return proof.proof.map((siblingHash, level) => {
    const pathIsRight = ((proof.index >> level) & 1) === 1
    return {
      level,
      siblingHash,
      siblingSide: pathIsRight ? "left" : "right",
      pathSide: pathIsRight ? "right" : "left",
    }
  })
}

function nodeClass(tone: MerkleNodeData["tone"]) {
  return cn(
    "w-56 rounded-md border bg-white px-3 py-2 text-left shadow-sm",
    tone === "entry" && "border-slate-300 bg-white",
    tone === "path" && "border-sky-300 bg-sky-50",
    tone === "sibling" && "border-violet-300 bg-violet-50",
    tone === "root" && "border-emerald-300 bg-emerald-50",
  )
}

function MerkleGraphNode({ data }: { data: MerkleNodeData }) {
  return (
    <div className={cn(nodeClass(data.tone), "relative")}>
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        className="!size-2 !border-2 !border-white !bg-sky-500"
      />
      <Handle
        id="bottom-source"
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-white !bg-violet-500"
      />
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-white !bg-sky-500"
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className="!size-2 !border-2 !border-white !bg-violet-500"
      />
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-white !bg-violet-500"
      />
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-white !bg-violet-500"
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className="!size-2 !border-2 !border-white !bg-violet-500"
      />
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-medium text-slate-800 text-xs">
          {data.label}
        </span>
        <span className="rounded bg-white/70 px-1.5 py-0.5 text-slate-500 text-[10px]">
          {data.caption}
        </span>
      </div>
      <div className="break-all font-mono text-slate-700 text-[10px] leading-4">
        {data.hash}
      </div>
    </div>
  )
}

const nodeTypes = {
  merkle: MerkleGraphNode,
}

function merkleGraph(proof: EntryProofResponse | null): {
  nodes: Node<MerkleNodeData>[]
  edges: Edge[]
} {
  if (!proof) {
    return { nodes: [], edges: [] }
  }

  const steps = proofSteps(proof)
  const pathX = 320
  const siblingX = 760
  const verticalGap = 170
  const rootY = 32
  const leafY = rootY + Math.max(1, steps.length + 1) * verticalGap
  const nodes: Node<MerkleNodeData>[] = [
    {
      id: "entry",
      type: "merkle",
      position: { x: pathX, y: leafY + 132 },
      data: {
        label: `Entry #${proof.index}`,
        hash: compactHash(displayEntryBody(proof.entry), 28, 18),
        caption: "body",
        tone: "entry",
      },
      draggable: false,
    },
    {
      id: "leaf",
      type: "merkle",
      position: { x: pathX, y: leafY },
      data: {
        label: "Leaf hash",
        hash: proof.leaf_hash,
        caption: "leaf",
        tone: "path",
      },
      draggable: false,
    },
    {
      id: "root",
      type: "merkle",
      position: { x: pathX, y: rootY },
      data: {
        label: "Checkpoint root",
        hash: proof.root_hash,
        caption: "root",
        tone: "root",
      },
      draggable: false,
    },
  ]

  const edges: Edge[] = [
    {
      id: "entry-leaf",
      source: "entry",
      target: "leaf",
      sourceHandle: "top-source",
      targetHandle: "bottom-target",
      label: "hash entry body",
      animated: proof.verified,
      type: "bezier",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#0ea5e9", strokeWidth: 2 },
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
      labelStyle: { fill: "#0369a1", fontSize: 11, fontWeight: 600 },
      interactionWidth: 18,
    },
  ]

  let previousPathNode = "leaf"
  steps.forEach((step, index) => {
    const levelY = leafY - (index + 1) * verticalGap
    const pathNodeId = index === steps.length - 1 ? "root" : `path-${index + 1}`
    const siblingNodeId = `sibling-${index}`
    const targetY = pathNodeId === "root" ? rootY : levelY
    const childY = targetY + verticalGap

    if (pathNodeId !== "root") {
      nodes.push({
        id: pathNodeId,
        type: "merkle",
        position: { x: pathX, y: targetY },
        data: {
          label: `Computed path hash`,
          hash: `level ${step.level + 1}`,
          caption: `L${step.level + 1}`,
          tone: "path",
        },
        draggable: false,
      })
    }

    nodes.push({
      id: siblingNodeId,
      type: "merkle",
      position: { x: siblingX, y: childY },
      data: {
        label: `Proof sibling`,
        hash: step.siblingHash,
        caption: `${step.siblingSide} L${step.level}`,
        tone: "sibling",
      },
      draggable: false,
    })

    edges.push(
      {
        id: `${previousPathNode}-${pathNodeId}`,
        source: previousPathNode,
        target: pathNodeId,
        sourceHandle: "top-source",
        targetHandle: "bottom-target",
        label: `${step.pathSide} path hash`,
        animated: proof.verified,
        type: "bezier",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#0ea5e9", strokeWidth: 2 },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
        labelStyle: { fill: "#0369a1", fontSize: 11, fontWeight: 600 },
        interactionWidth: 18,
      },
      {
        id: `${siblingNodeId}-${pathNodeId}`,
        source: siblingNodeId,
        target: pathNodeId,
        sourceHandle: "top-source",
        targetHandle: "bottom-target",
        label: `${step.siblingSide} proof sibling`,
        type: "bezier",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#8b5cf6", strokeWidth: 2 },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "#faf5ff", fillOpacity: 0.94 },
        labelStyle: { fill: "#6d28d9", fontSize: 11, fontWeight: 600 },
        interactionWidth: 18,
      },
    )

    previousPathNode = pathNodeId
  })

  if (steps.length === 0) {
    edges.push({
      id: "leaf-root",
      source: "leaf",
      target: "root",
      sourceHandle: "top-source",
      targetHandle: "bottom-target",
      label: "single-entry tree",
      animated: proof.verified,
      type: "bezier",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#0ea5e9", strokeWidth: 2 },
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.92 },
      labelStyle: { fill: "#0369a1", fontSize: 11, fontWeight: 600 },
      interactionWidth: 18,
    })
  }

  return { nodes, edges }
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-slate-500 text-xs font-medium">{label}</span>
        <Icon className="size-4 text-slate-400" />
      </div>
      <div className="truncate font-semibold text-2xl text-slate-950">
        {value}
      </div>
    </div>
  )
}

function HashBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "path" | "sibling" | "root"
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border bg-white p-3",
        tone === "path" && "border-sky-200 bg-sky-50",
        tone === "sibling" && "border-violet-200 bg-violet-50",
        tone === "root" && "border-emerald-200 bg-emerald-50",
        tone === "neutral" && "border-slate-200",
      )}
    >
      <div className="mb-2 text-slate-500 text-xs">{label}</div>
      <div className="break-all font-mono text-slate-800 text-xs">{value}</div>
    </div>
  )
}

function MerkleVisualization({ proof }: { proof: EntryProofResponse | null }) {
  const graph = useMemo(() => merkleGraph(proof), [proof])

  if (!proof) {
    return (
      <div className="flex min-h-96 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-slate-500 text-sm">
        Select an entry to draw the Merkle path.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-slate-200 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <IconGitBranch className="size-4 text-slate-500" />
          <h2 className="font-medium text-sm">Merkle Path</h2>
        </div>
        <div
          className={cn(
            "flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
            proof.verified
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {proof.verified ? (
            <IconCircleCheck className="size-4" />
          ) : (
            <IconCircleX className="size-4" />
          )}
          {proof.verified ? "Valid inclusion proof" : "Proof failed"}
        </div>
      </div>

      <div className="h-[720px] overflow-hidden rounded-b-lg bg-slate-50">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.35}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background color="#cbd5e1" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function MerklePage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [query, setQuery] = useState("")
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null)
  const [proof, setProof] = useState<EntryProofResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [proofLoading, setProofLoading] = useState(false)
  const [error, setError] = useState("")
  const proofRequestId = useRef(0)

  const verifyEntry = useCallback(async (entry: LogEntry | null) => {
    const requestId = proofRequestId.current + 1
    proofRequestId.current = requestId

    if (!entry) {
      setProof(null)
      setProofLoading(false)
      return
    }

    setProofLoading(true)
    setError("")
    setProof(null)
    try {
      const response = await fetch(
        `/api/chronicle/api/entries/${entry.index}/proof`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const nextProof = (await response.json()) as EntryProofResponse
      if (proofRequestId.current === requestId) {
        setProof(nextProof)
      }
    } catch (proofError) {
      if (proofRequestId.current === requestId) {
        setError(
          proofError instanceof Error
            ? proofError.message
            : "Unable to verify entry",
        )
      }
    } finally {
      if (proofRequestId.current === requestId) {
        setProofLoading(false)
      }
    }
  }, [])

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" })
      if (query.trim()) {
        params.set("q", query.trim())
      }
      const response = await fetch(`/api/chronicle/api/entries?${params}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as EntriesResponse
      setEntries(data.entries)
      setEntriesTotal(data.total)
      const firstEntry = data.entries[0] ?? null
      setSelectedEntry(firstEntry)
      void verifyEntry(firstEntry)
    } catch (entriesError) {
      setError(
        entriesError instanceof Error
          ? entriesError.message
          : "Unable to load entries",
      )
    } finally {
      setLoading(false)
    }
  }, [query, verifyEntry])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const selectEntry = (entry: LogEntry) => {
    setSelectedEntry(entry)
    void verifyEntry(entry)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-slate-200 border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <IconGitBranch className="size-5" />
            </div>
            <div>
              <h1 className="font-semibold text-xl">Merkle Tree</h1>
              <p className="text-slate-500 text-sm">
                Visual proof path from entry body to checkpoint root
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void loadEntries()}
              disabled={loading}
            >
              <IconRefresh />
              Refresh
            </Button>
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 font-medium text-slate-700 text-xs transition hover:bg-slate-50"
            >
              <IconArrowLeft className="size-4" />
              Console
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[340px_1fr] lg:px-8">
        <aside className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-slate-200 border-b px-4 py-3">
              <IconSearch className="size-4 text-slate-500" />
              <h2 className="font-medium text-sm">Entries</h2>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 text-xs">
                {formatNumber(entriesTotal)}
              </span>
            </div>
            <div className="space-y-3 p-4">
              <div className="relative">
                <IconSearch className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void loadEntries()
                    }
                  }}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pr-3 pl-8 text-sm outline-none ring-slate-300 transition focus:ring-2"
                  placeholder="Find entry..."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => void loadEntries()}
                disabled={loading}
                className="w-full"
              >
                <IconSearch />
                Find Entries
              </Button>
            </div>
            <div className="max-h-[34rem] overflow-auto border-slate-200 border-t">
              {entries.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">
                  No entries found.
                </div>
              ) : (
                entries.map((entry) => (
                  <button
                    key={entry.index}
                    type="button"
                    onClick={() => selectEntry(entry)}
                    className={cn(
                      "w-full border-slate-100 border-b px-4 py-3 text-left last:border-b-0 hover:bg-slate-50",
                      selectedEntry?.index === entry.index && "bg-slate-50",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-sm">
                        {entryLabel(entry)}
                      </span>
                      <span className="font-mono text-slate-500 text-xs">
                        #{entry.index}
                      </span>
                    </div>
                    <div className="truncate text-slate-500 text-xs">
                      {entry.source || "unknown source"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <div className="space-y-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-3">
            <Metric
              icon={IconShieldCheck}
              label="Proof status"
              value={proof ? (proof.verified ? "Valid" : "Failed") : "Waiting"}
            />
            <Metric
              icon={IconFingerprint}
              label="Tree size"
              value={formatNumber(proof?.tree_size)}
            />
            <Metric
              icon={IconGitBranch}
              label="Proof nodes"
              value={formatNumber(proof?.proof.length)}
            />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-slate-200 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <IconShieldCheck className="size-4 text-slate-500" />
                <h2 className="font-medium text-sm">Selected Entry</h2>
                <span className="font-mono text-slate-500 text-xs">
                  {selectedEntry ? `#${selectedEntry.index}` : "No entry"}
                </span>
              </div>
              {proofLoading ? (
                <span className="text-slate-500 text-xs">Verifying...</span>
              ) : null}
            </div>
            <div className="p-4">
              <JsonCodeViewer
                height={224}
                value={selectedEntry ? displayEntryBody(selectedEntry) : ""}
                emptyText="Select an entry to inspect it."
              />
            </div>
          </section>

          <MerkleVisualization proof={proof} />

          {proof ? (
            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-slate-200 border-b px-4 py-3">
                <IconFingerprint className="size-4 text-slate-500" />
                <h2 className="font-medium text-sm">Proof Details</h2>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <HashBox
                  label="Leaf hash"
                  value={proof.leaf_hash}
                  tone="path"
                />
                <HashBox
                  label="Root hash"
                  value={proof.root_hash}
                  tone="root"
                />
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                  <div className="mb-2 text-slate-500 text-xs">
                    Checkpoint signature
                  </div>
                  <div className="font-medium text-slate-700 text-sm">
                    {proof.checkpoint_verified
                      ? "Signature verified"
                      : "Signature not verified"}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                  <div className="mb-2 text-slate-500 text-xs">
                    Raw proof nodes
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-slate-700 text-xs">
                    {proof.proof.length > 0
                      ? proof.proof.join("\n")
                      : "No sibling nodes for a single-entry tree."}
                  </pre>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
