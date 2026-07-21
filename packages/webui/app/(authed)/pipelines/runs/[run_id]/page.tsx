"use client"

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { RunEvent } from "./StepGraph"

dayjs.extend(relativeTime)

const StepGraph = dynamic(
  () => import("./StepGraph").then((m) => m.StepGraph),
  { ssr: false }
)

const LineageGraph = dynamic(
  () =>
    import("../../assets/[...path]/LineageGraph").then((m) => m.LineageGraph),
  { ssr: false }
)

// ── Types ─────────────────────────────────────────────────────────────────────

type RunStats = {
  steps_succeeded: number | null
  steps_failed: number | null
  enqueued_time: number | null
  launch_time: number | null
  start_time: number | null
  end_time: number | null
}

type RunTag = { key: string; value: string }

type Run = {
  run_id: string
  job_name: string
  status: string
  tags: RunTag[]
  creation_time: number | null
  start_time: number | null
  end_time: number | null
  run_config_yaml: string | null
  root_run_id: string | null
  parent_run_id: string | null
  can_terminate: boolean | null
  stats: RunStats | null
}

type EventsResponse = {
  events: RunEvent[]
  cursor: string | null
  has_more: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts: string | number | null | undefined): string {
  if (!ts) {
    return "—"
  }
  const v = Number(ts)
  return isFinite(v)
    ? dayjs(v > 1e12 ? v : v * 1000).format("MMM D, h:mm:ss A")
    : "—"
}

function fmtDuration(start: number | null, end: number | null): string {
  if (!start) {
    return "—"
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

type StatusConfig = {
  label: string
  variant: "success" | "error" | "info" | "warning" | "default"
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  CANCELED: { label: "Canceled", variant: "default" },
  CANCELING: { label: "Canceling", variant: "warning" },
  FAILURE: { label: "Failed", variant: "error" },
  NOT_STARTED: { label: "Not started", variant: "default" },
  QUEUED: { label: "Queued", variant: "default" },
  STARTED: { label: "Running", variant: "info" },
  STARTING: { label: "Starting", variant: "info" },
  SUCCESS: { label: "Success", variant: "success" },
}

const VARIANT_DOT_CLS: Record<string, string> = {
  default: "bg-muted-foreground",
  error: "bg-destructive",
  info: "bg-blue-600 dark:bg-blue-400",
  success: "bg-green-600 dark:bg-green-400",
  warning: "bg-orange-600 dark:bg-orange-400",
}

const ACTIVE_STATUSES = new Set(["QUEUED", "STARTED", "STARTING", "CANCELING"])

function RunStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) {
    return <Badge variant="outline">{status}</Badge>
  }
  return (
    <Status variant={cfg.variant}>
      <StatusIndicator />
      <StatusLabel>{cfg.label}</StatusLabel>
    </Status>
  )
}

// ── Event log row ─────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  AssetMaterializationPlannedEvent: "text-emerald-400",
  EngineEvent: "text-zinc-400",
  ExecutionStepFailureEvent: "text-red-500",
  ExecutionStepSkippedEvent: "text-zinc-400",
  ExecutionStepStartEvent: "text-blue-500",
  ExecutionStepSuccessEvent: "text-green-500",
  LogMessageEvent: "text-zinc-500",
  MaterializationEvent: "text-emerald-500",
  RunCanceledEvent: "text-zinc-400",
  RunFailureEvent: "text-red-500",
  RunStartEvent: "text-blue-400",
  RunSuccessEvent: "text-green-500",
  StepWorkerStartedEvent: "text-zinc-400",
  StepWorkerStartingEvent: "text-zinc-400",
}

const SHORT_TYPE: Record<string, string> = {
  AssetMaterializationPlannedEvent: "MAT_PLANNED",
  EngineEvent: "ENGINE_EVENT",
  ExecutionStepFailureEvent: "STEP_FAILURE",
  ExecutionStepSkippedEvent: "STEP_SKIPPED",
  ExecutionStepStartEvent: "STEP_START",
  ExecutionStepSuccessEvent: "STEP_SUCCESS",
  HandledOutputEvent: "OUTPUT",
  LoadedInputEvent: "INPUT",
  LogMessageEvent: "LOG",
  MaterializationEvent: "ASSET_MATERIALIZATION",
  ObjectStoreOperationEvent: "OBJECT_STORE",
  ResourceInitFailureEvent: "RESOURCE_FAIL",
  ResourceInitStartedEvent: "RESOURCE_START",
  ResourceInitSuccessEvent: "RESOURCE_OK",
  RunCanceledEvent: "RUN_CANCELED",
  RunFailureEvent: "RUN_FAILURE",
  RunStartEvent: "RUN_START",
  RunSuccessEvent: "RUN_SUCCESS",
  StepExpectationResultEvent: "EXPECTATION",
  StepWorkerStartedEvent: "WORKER_STARTED",
  StepWorkerStartingEvent: "WORKER_STARTING",
}

function fmtEventTimestamp(ts: string | null | undefined): string {
  if (!ts) {
    return ""
  }
  const v = Number(ts)
  if (!isFinite(v)) {
    return ""
  }
  // Dagster timestamps in events are milliseconds
  return dayjs(v).format("h:mm:ss.SSS A")
}

function EventRow({
  event,
  highlight,
}: {
  event: RunEvent
  highlight: boolean
}) {
  const typeColor = EVENT_TYPE_COLORS[event.type] ?? "text-zinc-400"
  const shortType = SHORT_TYPE[event.type] ?? event.type
  const isError = event.type === "ExecutionStepFailureEvent"

  return (
    <tr
      className={cn(
        "border-border/50 border-b align-top text-xs",
        highlight && "bg-muted/40"
      )}
    >
      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground tabular-nums">
        {fmtEventTimestamp(event.timestamp)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">
        {event.step_key ?? <span className="opacity-40">—</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5">
        <span className={cn("font-semibold text-[11px]", typeColor)}>
          {shortType}
        </span>
      </td>
      <td className="max-w-[600px] px-3 py-1.5 text-foreground">
        {isError && event.error ? (
          <details>
            <summary className="cursor-pointer truncate text-red-500">
              {event.message ?? event.error}
            </summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-muted-foreground leading-relaxed">
              {event.error}
            </pre>
          </details>
        ) : event.asset_key ? (
          <span className="font-mono">{event.asset_key.join("/")}</span>
        ) : (
          <span className="block max-w-[600px] truncate">
            {event.message ?? ""}
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Step status summary ───────────────────────────────────────────────────────

type StepSummaryItem = { label: string; count: number; cls: string }

function StepSummary({ stats }: { stats: RunStats | null }) {
  if (!stats) {
    return null
  }
  const items: StepSummaryItem[] = [
    { cls: "text-muted-foreground", count: 0, label: "Preparing" },
    { cls: "text-blue-500", count: 0, label: "Executing" },
    { cls: "text-red-500", count: stats.steps_failed ?? 0, label: "Errored" },
    {
      cls: "text-green-500",
      count: stats.steps_succeeded ?? 0,
      label: "Succeeded",
    },
  ]
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div
          className="flex items-center justify-between text-xs"
          key={item.label}
        >
          <span className={cn("font-medium", item.cls)}>
            {item.label} ({item.count})
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Re-executions ─────────────────────────────────────────────────────────────

function ReExecutions({
  rootRunId,
  runId,
}: {
  rootRunId: string | null
  runId: string
}) {
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    if (!rootRunId) {
      return
    }
    fetchWithAuth("/api/dagster/runs?limit=20", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { runs: Run[] }) => {
        const related = d.runs.filter(
          (r) => r.root_run_id === rootRunId || r.run_id === rootRunId
        )
        setRuns(related)
      })
      .catch(() => {})
  }, [rootRunId])

  if (runs.length <= 1) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2.5">
        <span className="font-semibold text-xs">
          Re-executions ({runs.length})
        </span>
      </div>
      <div className="divide-y">
        {runs.map((r) => {
          const cfg = STATUS_CONFIG[r.status]
          const isThis = r.run_id === runId
          return (
            <Link
              className={cn(
                "flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/30",
                isThis && "bg-muted/50"
              )}
              href={`/pipelines/runs/${r.run_id}`}
              key={r.run_id}
            >
              <div className="flex min-w-0 items-center gap-2">
                {cfg && (
                  <StatusIndicator className={VARIANT_DOT_CLS[cfg.variant]} />
                )}
                <span className="font-mono text-xs">
                  {r.run_id.slice(0, 8)}
                </span>
                {r.root_run_id === null || r.root_run_id === r.run_id ? (
                  <span className="text-[10px] text-muted-foreground">
                    ROOT
                  </span>
                ) : null}
              </div>
              <div className="ml-4 flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {fmtTs(r.start_time ?? r.creation_time)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtDuration(r.start_time, r.end_time)}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Polling hook ──────────────────────────────────────────────────────────────

function useRunDetail(runId: string) {
  const [run, setRun] = useState<Run | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      try {
        const [runRes, eventsRes] = await Promise.all([
          fetchWithAuth(`/api/dagster/runs/${runId}`, { cache: "no-store" }),
          fetchWithAuth(`/api/dagster/runs/${runId}/events`, {
            cache: "no-store",
          }),
        ])
        if (!runRes.ok) {
          throw new Error(`HTTP ${runRes.status}`)
        }
        const runData = (await runRes.json()) as Run
        const eventsData = (await eventsRes.json()) as EventsResponse

        if (!cancelled) {
          setRun(runData)
          setEvents(eventsData.events ?? [])
          setLoading(false)
          const active = ACTIVE_STATUSES.has(runData.status)
          timerRef.current = setTimeout(fetchAll, active ? 3000 : 30_000)
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setLoading(false)
        }
      }
    }

    fetchAll()
    return () => {
      cancelled = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [runId])

  return { error, events, loading, run }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const params = useParams()
  const runId =
    typeof params.run_id === "string"
      ? params.run_id
      : (params.run_id as string[])[0]

  const { run, events, loading, error } = useRunDetail(runId)
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"events" | "config" | "lineage">(
    "events"
  )
  const [graphHeight, setGraphHeight] = useState(500)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = { startH: graphHeight, startY: e.clientY }
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) {
        return
      }
      const delta = ev.clientY - dragRef.current.startY
      setGraphHeight(
        Math.max(80, Math.min(600, dragRef.current.startH + delta))
      )
    }
    function onUp() {
      dragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const selectedStepAssetPath = useMemo(() => {
    if (!selectedStep) {
      return
    }
    const e = events.find(
      (ev) =>
        ev.step_key === selectedStep && ev.asset_key && ev.asset_key.length > 0
    )
    return e?.asset_key ?? undefined
  }, [selectedStep, events])

  const filteredEvents = selectedStep
    ? events.filter((e) => !e.step_key || e.step_key === selectedStep)
    : events

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading run…
      </div>
    )
  }
  if (error || !run) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-destructive text-sm">
        {error ?? "Run not found"}
      </div>
    )
  }

  const totalSteps =
    (run.stats?.steps_succeeded ?? 0) + (run.stats?.steps_failed ?? 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <Link
          className="text-muted-foreground text-xs transition-colors hover:text-foreground"
          href="/pipelines/runs"
        >
          Runs
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="font-mono font-semibold text-xs">{runId}</span>
        <RunStatusBadge status={run.status} />
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {fmtTs(run.start_time ?? run.creation_time)}
          </span>
          <span className="text-muted-foreground text-xs">
            {fmtDuration(run.start_time, run.end_time)}
          </span>
          {totalSteps > 0 && (
            <span className="text-muted-foreground text-xs">
              {run.stats?.steps_succeeded ?? 0}/{totalSteps} steps
            </span>
          )}
        </div>
      </div>

      {/* Main split: graph + right sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: graph + event log */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Step graph */}
          <div className="relative shrink-0" style={{ height: graphHeight }}>
            <StepGraph
              events={events}
              onSelectStep={setSelectedStep}
              selectedKey={selectedStep}
            />
            {selectedStep && (
              <button
                className="absolute top-2 right-2 z-10 rounded border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                onClick={() => setSelectedStep(null)}
                type="button"
              >
                Clear filter
              </button>
            )}
          </div>

          {/* Resize handle */}
          <div
            className="h-1.5 shrink-0 cursor-row-resize border-b transition-colors hover:bg-muted/60 active:bg-muted"
            onMouseDown={onDividerMouseDown}
          />

          {/* Tabs: Events / Config */}
          <div className="flex shrink-0 items-center gap-4 border-b px-4">
            {(["events", "config", "lineage"] as const).map((t) => (
              <button
                className={cn(
                  "border-b-2 py-2 text-xs capitalize transition-colors",
                  activeTab === t
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                key={t}
                onClick={() => setActiveTab(t)}
                type="button"
              >
                {t === "events"
                  ? `Events (${filteredEvents.length})`
                  : t === "lineage"
                    ? "Lineage"
                    : "Config"}
              </button>
            ))}
            {selectedStep && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                Filtered to step:{" "}
                <span className="font-mono">{selectedStep}</span>
              </span>
            )}
          </div>

          {/* Event log */}
          {activeTab === "events" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Timestamp
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      OP
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">
                      Event Type
                    </th>
                    <th className="px-3 py-2 font-medium">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-8 text-center text-muted-foreground"
                        colSpan={4}
                      >
                        No events
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((e, i) => (
                      <EventRow
                        event={e}
                        highlight={
                          !!selectedStep && e.step_key === selectedStep
                        }
                        key={i}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Config tab */}
          {activeTab === "config" && (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {run.run_config_yaml ? (
                <pre className="whitespace-pre-wrap font-mono text-foreground text-xs leading-relaxed">
                  {run.run_config_yaml}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm">No run config</p>
              )}
            </div>
          )}

          {/* Lineage tab */}
          {activeTab === "lineage" && (
            <div className="relative min-h-0 flex-1">
              <LineageGraph
                currentPath={selectedStepAssetPath ?? undefined}
                neighborhoodOnly={false}
              />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-64 shrink-0 overflow-y-auto border-l">
          <div className="flex flex-col">
            {/* Step counts */}
            <div className="px-4 py-4">
              <p className="mb-2 font-semibold text-xs">Execution</p>
              <StepSummary stats={run.stats} />
            </div>

            <div className="h-px bg-border" />

            {/* Run details */}
            <div className="px-4 py-4">
              <p className="mb-2 font-semibold text-xs">Details</p>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Run ID</span>
                  <span className="truncate font-mono">
                    {runId.slice(0, 8)}…
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Job</span>
                  <span className="truncate font-mono">{run.job_name}</span>
                </div>
                {run.parent_run_id && (
                  <div className="flex justify-between gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      Parent
                    </span>
                    <Link
                      className="truncate font-mono text-blue-500 hover:underline"
                      href={`/pipelines/runs/${run.parent_run_id}`}
                    >
                      {run.parent_run_id.slice(0, 8)}…
                    </Link>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    Started
                  </span>
                  <span className="text-right">{fmtTs(run.start_time)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    Duration
                  </span>
                  <span>{fmtDuration(run.start_time, run.end_time)}</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            {run.tags.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <div className="px-4 py-4">
                  <p className="mb-2 font-semibold text-xs">Tags</p>
                  <div className="flex flex-col gap-1">
                    {run.tags
                      .filter((t) => !t.key.startsWith("dagster/"))
                      .map((t, i) => (
                        <div
                          className="break-all rounded bg-muted px-2 py-1 font-mono text-[10px]"
                          key={i}
                        >
                          {t.key}
                          {t.value ? `=${t.value}` : ""}
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}

            <div className="h-px bg-border" />

            {/* Re-executions */}
            <div className="px-4 py-4">
              <ReExecutions rootRunId={run.root_run_id} runId={runId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
