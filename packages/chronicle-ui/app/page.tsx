"use client"

import {
  IconArrowRight,
  IconBrandSpeedtest,
  IconCircleCheck,
  IconCircleX,
  IconDatabase,
  IconFileSearch,
  IconFingerprint,
  IconGitBranch,
  IconKey,
  IconListCheck,
  IconRefresh,
  IconSearch,
  IconServer,
  IconShieldCheck,
  IconTable,
  IconTimeline,
  IconUsersGroup,
} from "@tabler/icons-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { JsonCodeViewer } from "@/components/json-code-viewer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type TesseraStatus = {
  storage_backend: string
  log_dir: string
  signer: string
  verifier_key: string
  next_index: number
  integrated_size: number
  witness_enabled: boolean
  witness_policy?: string
  witness_fail_open?: boolean
  witness_timeout?: string
}

type HealthState = "checking" | "online" | "offline"
type LookupMode = "tile" | "entries"
type IconComponent = React.ComponentType<{ className?: string }>
type ParsedCheckpoint = {
  origin: string
  size: number
  rootHash: string
  signature: string
  parseable: boolean
}
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

const lookupExamples: Record<LookupMode, string> = {
  entries: "000.p/1",
  tile: "0/000.p/1",
}

async function readTextResponse(response: Response) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return text
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "0"
}

function compactKey(value: string | undefined) {
  if (!value) {
    return "Unavailable"
  }
  if (value.length <= 32) {
    return value
  }
  return `${value.slice(0, 18)}...${value.slice(-10)}`
}

function entryPreview(entry: LogEntry) {
  if (entry.event_type) {
    return entry.event_type
  }
  if (entry.body) {
    return entry.body.length > 96 ? `${entry.body.slice(0, 96)}...` : entry.body
  }
  if (entry.body_base64) {
    return `base64:${entry.body_base64.slice(0, 72)}`
  }
  return "Entry"
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

function parseCheckpoint(checkpoint: string): ParsedCheckpoint | null {
  const lines = checkpoint.split("\n")
  if (lines.length < 3 || !lines[0] || !lines[1] || !lines[2]) {
    return null
  }

  const size = Number.parseInt(lines[1], 10)
  return {
    origin: lines[0],
    size,
    rootHash: lines[2],
    signature: lines.slice(3).join("\n").trim(),
    parseable: Number.isFinite(size) && lines[2].length > 0,
  }
}

function StatusDot({ state }: { state: HealthState }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full",
        state === "online" && "bg-emerald-500",
        state === "offline" && "bg-red-500",
        state === "checking" && "bg-amber-400",
      )}
    />
  )
}

function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: IconComponent
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-slate-600 text-xs font-medium">
      <Icon className="size-4 text-slate-400" />
      {children}
    </div>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: IconComponent
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

function StatusBadge({
  active,
  activeText,
  inactiveText,
}: {
  active: boolean
  activeText: string
  inactiveText: string
}) {
  return (
    <Badge variant={active ? "success" : "warning"}>
      <StatusDot state={active ? "online" : "checking"} />
      {active ? activeText : inactiveText}
    </Badge>
  )
}

export default function Home() {
  const [health, setHealth] = useState<HealthState>("checking")
  const [status, setStatus] = useState<TesseraStatus | null>(null)
  const [checkpoint, setCheckpoint] = useState("")
  const [lookupMode, setLookupMode] = useState<LookupMode>("entries")
  const [lookupPath, setLookupPath] = useState("000.p/1")
  const [lookupResult, setLookupResult] = useState("")
  const [coveredIndex, setCoveredIndex] = useState("0")
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [entriesHasMore, setEntriesHasMore] = useState(false)
  const [entryOffset, setEntryOffset] = useState(0)
  const [entryQuery, setEntryQuery] = useState("")
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null)
  const [entryProof, setEntryProof] = useState<EntryProofResponse | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [proofLoading, setProofLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [healthResponse, statusResponse, checkpointResponse] =
        await Promise.all([
          fetch("/api/chronicle/healthz", { cache: "no-store" }),
          fetch("/api/chronicle/tessera", { cache: "no-store" }),
          fetch("/api/chronicle/checkpoint", { cache: "no-store" }),
        ])

      setHealth(healthResponse.ok ? "online" : "offline")

      if (statusResponse.ok) {
        setStatus((await statusResponse.json()) as TesseraStatus)
      } else {
        setStatus(null)
      }

      if (checkpointResponse.ok) {
        setCheckpoint(await checkpointResponse.text())
      } else {
        setCheckpoint("")
      }
    } catch (refreshError) {
      setHealth("offline")
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to reach Chronicle",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const loadEntries = useCallback(
    async (offset: number) => {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams({
          limit: "100",
          offset: `${offset}`,
        })
        if (entryQuery.trim()) {
          params.set("q", entryQuery.trim())
        }
        const response = await fetch(`/api/chronicle/api/entries?${params}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const data = (await response.json()) as EntriesResponse
        setEntries(data.entries)
        setEntriesHasMore(data.has_more)
        setEntriesTotal(data.total)
        setEntryOffset(data.offset)
        setSelectedEntry(data.entries[0] ?? null)
        setEntryProof(null)
        if (data.entries[0]) {
          setCoveredIndex(String(data.entries[0].index))
        }
      } catch (entriesError) {
        setError(
          entriesError instanceof Error
            ? entriesError.message
            : "Unable to load entries",
        )
      } finally {
        setLoading(false)
      }
    },
    [entryQuery],
  )

  useEffect(() => {
    void loadEntries(0)
  }, [loadEntries])

  const searchEntries = () => {
    void loadEntries(0)
  }

  const nextEntriesPage = () => {
    void loadEntries(entryOffset + 100)
  }

  const previousEntriesPage = () => {
    void loadEntries(Math.max(0, entryOffset - 100))
  }

  const lookupResource = async () => {
    const cleanPath = lookupPath.replace(/^\/+/, "")
    if (!cleanPath) {
      setError("Enter a tile or entry bundle path")
      return
    }

    setLoading(true)
    setError("")
    setLookupResult("")
    try {
      const response = await fetch(
        `/api/chronicle/${lookupMode}/${cleanPath}`,
        {
          cache: "no-store",
        },
      )
      setLookupResult(await readTextResponse(response))
    } catch (lookupError) {
      setError(
        lookupError instanceof Error ? lookupError.message : "Lookup failed",
      )
    } finally {
      setLoading(false)
    }
  }

  const selectEntry = (entry: LogEntry) => {
    setSelectedEntry(entry)
    setCoveredIndex(String(entry.index))
    setEntryProof(null)
    setError("")
  }

  const verifySelectedEntry = async () => {
    if (!selectedEntry) {
      return
    }

    setProofLoading(true)
    setError("")
    setEntryProof(null)
    try {
      const response = await fetch(
        `/api/chronicle/api/entries/${selectedEntry.index}/proof`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error(await response.text())
      }
      setEntryProof((await response.json()) as EntryProofResponse)
    } catch (proofError) {
      setError(
        proofError instanceof Error
          ? proofError.message
          : "Unable to verify entry",
      )
    } finally {
      setProofLoading(false)
    }
  }

  const selectLookupMode = (mode: LookupMode) => {
    setLookupMode(mode)
    setLookupPath(lookupExamples[mode])
    setLookupResult("")
    setError("")
  }

  const storageLabel = status?.storage_backend || "Unknown"
  const witnessesEnabled = status?.witness_enabled === true
  const witnessMode =
    status?.witness_fail_open === true ? "Fail-open" : "Blocking"
  const witnessPolicy = status?.witness_policy || "Not configured"
  const witnessTimeout = status?.witness_timeout || "Unavailable"
  const checkpointLines = useMemo(
    () => checkpoint.split("\n").filter(Boolean),
    [checkpoint],
  )
  const parsedCheckpoint = useMemo(
    () => parseCheckpoint(checkpoint),
    [checkpoint],
  )
  const coveredIndexNumber = Number.parseInt(coveredIndex, 10)
  const hasCoveredIndex = Number.isFinite(coveredIndexNumber)
  const isIndexCovered =
    parsedCheckpoint?.parseable &&
    hasCoveredIndex &&
    coveredIndexNumber >= 0 &&
    coveredIndexNumber < parsedCheckpoint.size

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-slate-200 border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <IconTimeline className="size-5" />
            </div>
            <div>
              <h1 className="font-semibold text-xl">Chronicle</h1>
              <p className="text-slate-500 text-sm">
                Tessera transparency log console
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
              <StatusDot state={health} />
              <span className="font-medium capitalize">{health}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <IconRefresh />
              Refresh
            </Button>
            <Link
              href="/merkle"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 font-medium text-slate-700 text-xs transition hover:bg-slate-50"
            >
              <IconGitBranch className="size-4" />
              Merkle Tree
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <IconServer className="size-4 text-slate-500" />
            <h2 className="font-medium text-sm">Runtime</h2>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">Storage</dt>
              <dd className="font-medium">{storageLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Log directory</dt>
              <dd className="break-all font-mono text-xs">
                {status?.log_dir || "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Signer</dt>
              <dd className="font-medium">{status?.signer || "Unavailable"}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-slate-500">
                <IconKey className="size-3.5" />
                Verifier key
              </dt>
              <dd className="break-all font-mono text-xs">
                {compactKey(status?.verifier_key)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 border-slate-200 border-b py-3">
              <div className="flex items-center gap-2">
                <IconUsersGroup className="size-4 text-slate-500" />
                <CardTitle>Witnesses</CardTitle>
              </div>
              <StatusBadge
                active={witnessesEnabled}
                activeText="Enabled"
                inactiveText="Disabled"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-slate-500 text-xs">Policy source</div>
                <div className="mt-1 break-all font-mono text-sm">
                  {witnessPolicy}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-500 text-xs">Mode</div>
                  <div className="mt-1 font-medium text-sm">{witnessMode}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-500 text-xs">Timeout</div>
                  <div className="mt-1 font-mono text-sm">{witnessTimeout}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-slate-200 border-b py-3">
              <CardTitle>Checkpoint Publication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusBadge
                active={witnessesEnabled && !status?.witness_fail_open}
                activeText="Cosignatures required"
                inactiveText={
                  witnessesEnabled ? "Cosignatures optional" : "Log only"
                }
              />
              <dl className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Latest checkpoint</dt>
                  <dd className="font-mono">
                    {parsedCheckpoint?.parseable
                      ? formatNumber(parsedCheckpoint.size)
                      : "Unavailable"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Integrated size</dt>
                  <dd className="font-mono">
                    {formatNumber(status?.integrated_size)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-slate-200 border-b py-3">
              <CardTitle>Witness Policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant={witnessesEnabled ? "outline" : "secondary"}>
                {witnessesEnabled ? "Configured" : "No policy"}
              </Badge>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-slate-500 text-xs">Failure handling</div>
                <div className="mt-1 font-medium text-sm">
                  {status?.witness_fail_open
                    ? "Publish when witnesses time out"
                    : "Block publication on witness failure"}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-3">
            <Metric
              icon={IconDatabase}
              label="Next index"
              value={formatNumber(status?.next_index)}
            />
            <Metric
              icon={IconShieldCheck}
              label="Integrated size"
              value={formatNumber(status?.integrated_size)}
            />
            <Metric icon={IconBrandSpeedtest} label="Health" value={health} />
          </section>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-slate-200 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <IconTable className="size-4 text-slate-500" />
                <h2 className="font-medium text-sm">Entries</h2>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 text-xs">
                  {formatNumber(entriesTotal)} total
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <IconSearch className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-slate-400" />
                  <input
                    value={entryQuery}
                    onChange={(event) => setEntryQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        searchEntries()
                      }
                    }}
                    className="h-8 w-full rounded-md border border-slate-200 bg-white pr-3 pl-8 text-sm outline-none ring-slate-300 transition focus:ring-2 sm:w-80"
                    placeholder="Find event type, source, resource..."
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={searchEntries}
                  disabled={loading}
                >
                  <IconSearch />
                  Find
                </Button>
              </div>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[1fr_420px]">
              <div className="overflow-hidden rounded-md border border-slate-200">
                <div className="grid grid-cols-[88px_1fr_150px_120px] border-slate-200 border-b bg-slate-50 px-3 py-2 font-medium text-slate-500 text-xs">
                  <span>Index</span>
                  <span>Event</span>
                  <span>Source</span>
                  <span>Bundle</span>
                </div>
                <div className="max-h-96 overflow-auto">
                  {entries.length === 0 ? (
                    <div className="px-3 py-8 text-center text-slate-500 text-sm">
                      No entries found.
                    </div>
                  ) : (
                    entries.map((entry) => (
                      <button
                        key={entry.index}
                        type="button"
                        onClick={() => selectEntry(entry)}
                        className={cn(
                          "grid w-full grid-cols-[88px_1fr_150px_120px] items-center gap-3 border-slate-100 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50",
                          selectedEntry?.index === entry.index && "bg-slate-50",
                        )}
                      >
                        <span className="font-mono text-slate-600">
                          {entry.index}
                        </span>
                        <span className="truncate font-medium">
                          {entryPreview(entry)}
                        </span>
                        <span className="truncate text-slate-500">
                          {entry.source || "unknown"}
                        </span>
                        <span className="truncate font-mono text-slate-500 text-xs">
                          {entry.bundle}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between border-slate-200 border-t bg-slate-50 px-3 py-2">
                  <span className="text-slate-500 text-xs">
                    Showing from offset {entryOffset}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={previousEntriesPage}
                      disabled={loading || entryOffset === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={nextEntriesPage}
                      disabled={loading || !entriesHasMore}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between gap-3 border-slate-200 border-b px-3 py-2">
                  <div>
                    <span className="font-medium text-sm">Entry detail</span>
                    <span className="ml-2 font-mono text-slate-500 text-xs">
                      {selectedEntry ? `#${selectedEntry.index}` : "No entry"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void verifySelectedEntry()}
                    disabled={!selectedEntry || proofLoading}
                  >
                    <IconShieldCheck />
                    Verify
                  </Button>
                </div>
                <div className="max-h-[34rem] overflow-auto">
                  <div className="p-3">
                    <JsonCodeViewer
                      height={224}
                      value={
                        selectedEntry ? displayEntryBody(selectedEntry) : ""
                      }
                      emptyText="Select an entry to inspect it."
                    />
                  </div>
                  {entryProof ? (
                    <div className="border-slate-200 border-t p-3">
                      <div
                        className={cn(
                          "mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                          entryProof.verified
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-red-200 bg-red-50 text-red-800",
                        )}
                      >
                        {entryProof.verified ? (
                          <IconCircleCheck className="size-4" />
                        ) : (
                          <IconCircleX className="size-4" />
                        )}
                        {entryProof.verified
                          ? "Merkle inclusion proof is valid."
                          : entryProof.verification_error ||
                            "Merkle inclusion proof failed."}
                      </div>
                      <dl className="grid gap-2 text-xs">
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <dt className="text-slate-500">Checkpoint</dt>
                          <dd className="font-medium text-slate-700">
                            {entryProof.checkpoint_verified
                              ? "Signature verified"
                              : "Signature not verified"}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <dt className="text-slate-500">Tree size</dt>
                          <dd className="font-mono text-slate-700">
                            {formatNumber(entryProof.tree_size)}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <dt className="text-slate-500">Leaf hash</dt>
                          <dd className="break-all font-mono text-slate-700">
                            {entryProof.leaf_hash}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <dt className="text-slate-500">Root hash</dt>
                          <dd className="break-all font-mono text-slate-700">
                            {entryProof.root_hash}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[92px_1fr] gap-2">
                          <dt className="text-slate-500">Proof nodes</dt>
                          <dd className="font-mono text-slate-700">
                            {entryProof.proof.length}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-slate-200 border-b px-4 py-3">
              <IconGitBranch className="size-4 text-slate-500" />
              <h2 className="font-medium text-sm">Merkle Checkpoint</h2>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-slate-500 text-xs">
                    <IconServer className="size-3.5" />
                    Log origin
                  </div>
                  <div className="break-all font-mono text-sm">
                    {parsedCheckpoint?.origin || "Unavailable"}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-slate-500 text-xs">
                    <IconListCheck className="size-3.5" />
                    Checkpoint tree size
                  </div>
                  <div className="font-mono text-sm">
                    {parsedCheckpoint?.parseable
                      ? formatNumber(parsedCheckpoint.size)
                      : "Unavailable"}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                  <div className="mb-2 flex items-center gap-2 text-slate-500 text-xs">
                    <IconFingerprint className="size-3.5" />
                    Merkle root hash
                  </div>
                  <div className="break-all font-mono text-sm">
                    {parsedCheckpoint?.rootHash || "Unavailable"}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                  <div className="mb-2 flex items-center gap-2 text-slate-500 text-xs">
                    <IconKey className="size-3.5" />
                    Signature note
                  </div>
                  <div className="break-all font-mono text-xs">
                    {parsedCheckpoint?.signature || "Unavailable"}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <FieldLabel icon={IconArrowRight}>
                  Check whether a log index is covered
                </FieldLabel>
                <input
                  value={coveredIndex}
                  onChange={(event) => setCoveredIndex(event.target.value)}
                  className="mt-3 h-9 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none ring-slate-300 transition focus:ring-2"
                  inputMode="numeric"
                  placeholder="42"
                />
                <div
                  className={cn(
                    "mt-3 rounded-md border px-3 py-2 text-sm",
                    isIndexCovered
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}
                >
                  {isIndexCovered
                    ? `Index ${coveredIndexNumber} is within the latest checkpoint.`
                    : "This index is not covered by the latest checkpoint yet."}
                </div>
                <p className="mt-3 text-slate-500 text-xs leading-5">
                  Use Verify on an entry to check its Merkle inclusion proof
                  against this signed checkpoint.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div>
              <div className="flex items-center gap-2 border-slate-200 border-b px-4 py-3">
                <IconShieldCheck className="size-4 text-slate-500" />
                <h2 className="font-medium text-sm">Checkpoint</h2>
              </div>
              <div className="p-4">
                {checkpointLines.length > 0 ? (
                  <pre className="min-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-slate-700 text-xs">
                    {checkpoint}
                  </pre>
                ) : (
                  <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-500 text-sm">
                    No checkpoint published yet
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-slate-200 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <IconFileSearch className="size-4 text-slate-500" />
                <h2 className="font-medium text-sm">Tile and Entry Lookup</h2>
              </div>
              <div className="flex w-fit rounded-md border border-slate-200 bg-slate-50 p-1">
                {(["entries", "tile"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectLookupMode(mode)}
                    className={cn(
                      "h-7 rounded px-3 text-xs capitalize transition",
                      lookupMode === mode
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-950",
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                <FieldLabel icon={IconArrowRight}>
                  {lookupMode === "entries"
                    ? "Bundle path below tile/entries"
                    : "Tile path below tile"}
                </FieldLabel>
                <input
                  value={lookupPath}
                  onChange={(event) => setLookupPath(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm outline-none ring-slate-300 transition focus:ring-2"
                  placeholder={
                    lookupMode === "entries" ? "000.p/1" : "0/000.p/1"
                  }
                />
                <p className="text-slate-500 text-xs leading-5">
                  {lookupMode === "entries"
                    ? "Use paths like 000.p/1 for entry bundles."
                    : "Use paths like 0/000.p/1 for hash tiles. Entry bundles live under the Entries tab."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => void lookupResource()}
                  disabled={loading}
                  className="w-full"
                >
                  <IconFileSearch />
                  Read Resource
                </Button>
              </div>
              <pre className="min-h-40 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-slate-700 text-xs">
                {lookupResult || "Resource bytes will appear here."}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
