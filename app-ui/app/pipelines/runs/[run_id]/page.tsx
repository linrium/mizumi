'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Loading03Icon,
  HourglassIcon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import type { RunEvent } from './StepGraph'

dayjs.extend(relativeTime)

const StepGraph = dynamic(() => import('./StepGraph').then((m) => m.StepGraph), { ssr: false })

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
  if (!ts) return '—'
  const v = Number(ts)
  return isFinite(v) ? dayjs(v > 1e12 ? v : v * 1000).format('MMM D, h:mm:ss A') : '—'
}

function fmtDuration(start: number | null, end: number | null): string {
  if (!start) return '—'
  const sec = Math.round((end ?? Date.now() / 1000) - start)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

type StatusConfig = { label: string; icon: IconSvgElement; badgeCls: string }

const STATUS_CONFIG: Record<string, StatusConfig> = {
  SUCCESS:     { label: 'Success',     icon: CheckmarkCircle01Icon, badgeCls: 'border-green-200  bg-green-50  text-green-700  dark:border-green-800  dark:bg-green-950  dark:text-green-400' },
  FAILURE:     { label: 'Failed',      icon: Cancel01Icon,          badgeCls: 'border-red-200    bg-red-50    text-red-700    dark:border-red-800    dark:bg-red-950    dark:text-red-400' },
  STARTED:     { label: 'Running',     icon: Loading03Icon,         badgeCls: 'border-blue-200   bg-blue-50   text-blue-700   dark:border-blue-800   dark:bg-blue-950   dark:text-blue-400' },
  STARTING:    { label: 'Starting',    icon: Loading03Icon,         badgeCls: 'border-blue-200   bg-blue-50   text-blue-700   dark:border-blue-800   dark:bg-blue-950   dark:text-blue-400' },
  QUEUED:      { label: 'Queued',      icon: HourglassIcon,         badgeCls: 'border-border bg-muted text-muted-foreground' },
  CANCELING:   { label: 'Canceling',   icon: Loading03Icon,         badgeCls: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400' },
  CANCELED:    { label: 'Canceled',    icon: MinusSignCircleIcon,   badgeCls: 'border-border bg-muted text-muted-foreground' },
  NOT_STARTED: { label: 'Not started', icon: HourglassIcon,         badgeCls: 'border-border bg-muted text-muted-foreground' },
}

const ACTIVE_STATUSES = new Set(['QUEUED', 'STARTED', 'STARTING', 'CANCELING'])

function RunStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return <Badge variant="outline">{status}</Badge>
  const spinning = ACTIVE_STATUSES.has(status)
  return (
    <Badge variant="outline" className={cfg.badgeCls}>
      <HugeiconsIcon icon={cfg.icon} size={10} className={spinning ? 'animate-spin' : undefined} />
      {cfg.label}
    </Badge>
  )
}

// ── Event log row ─────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  ExecutionStepStartEvent:   'text-blue-500',
  ExecutionStepSuccessEvent: 'text-green-500',
  ExecutionStepFailureEvent: 'text-red-500',
  ExecutionStepSkippedEvent: 'text-zinc-400',
  MaterializationEvent:      'text-emerald-500',
  AssetMaterializationPlannedEvent: 'text-emerald-400',
  StepWorkerStartedEvent:    'text-zinc-400',
  StepWorkerStartingEvent:   'text-zinc-400',
  RunStartEvent:             'text-blue-400',
  RunSuccessEvent:           'text-green-500',
  RunFailureEvent:           'text-red-500',
  RunCanceledEvent:          'text-zinc-400',
  EngineEvent:               'text-zinc-400',
  LogMessageEvent:           'text-zinc-500',
}

const SHORT_TYPE: Record<string, string> = {
  ExecutionStepStartEvent:   'STEP_START',
  ExecutionStepSuccessEvent: 'STEP_SUCCESS',
  ExecutionStepFailureEvent: 'STEP_FAILURE',
  ExecutionStepSkippedEvent: 'STEP_SKIPPED',
  MaterializationEvent:      'ASSET_MATERIALIZATION',
  AssetMaterializationPlannedEvent: 'MAT_PLANNED',
  StepWorkerStartedEvent:    'WORKER_STARTED',
  StepWorkerStartingEvent:   'WORKER_STARTING',
  RunStartEvent:             'RUN_START',
  RunSuccessEvent:           'RUN_SUCCESS',
  RunFailureEvent:           'RUN_FAILURE',
  RunCanceledEvent:          'RUN_CANCELED',
  EngineEvent:               'ENGINE_EVENT',
  LogMessageEvent:           'LOG',
  HandledOutputEvent:        'OUTPUT',
  LoadedInputEvent:          'INPUT',
  ObjectStoreOperationEvent: 'OBJECT_STORE',
  ResourceInitFailureEvent:  'RESOURCE_FAIL',
  ResourceInitStartedEvent:  'RESOURCE_START',
  ResourceInitSuccessEvent:  'RESOURCE_OK',
  StepExpectationResultEvent:'EXPECTATION',
}

function fmtEventTimestamp(ts: string | null | undefined): string {
  if (!ts) return ''
  const v = Number(ts)
  if (!isFinite(v)) return ''
  // Dagster timestamps in events are milliseconds
  return dayjs(v).format('h:mm:ss.SSS A')
}

function EventRow({
  event,
  highlight,
}: {
  event: RunEvent
  highlight: boolean
}) {
  const typeColor = EVENT_TYPE_COLORS[event.type] ?? 'text-zinc-400'
  const shortType = SHORT_TYPE[event.type] ?? event.type
  const isError = event.type === 'ExecutionStepFailureEvent'

  return (
    <tr className={cn('align-top border-b border-border/50 text-xs', highlight && 'bg-muted/40')}>
      <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap tabular-nums">
        {fmtEventTimestamp(event.timestamp)}
      </td>
      <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
        {event.step_key ?? <span className="opacity-40">—</span>}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <span className={cn('font-semibold text-[11px]', typeColor)}>{shortType}</span>
      </td>
      <td className="px-3 py-1.5 text-foreground max-w-[600px]">
        {isError && event.error ? (
          <details>
            <summary className="cursor-pointer text-red-500 truncate">{event.message ?? event.error}</summary>
            <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed">
              {event.error}
            </pre>
          </details>
        ) : event.asset_key ? (
          <span className="font-mono">{event.asset_key.join('/')}</span>
        ) : (
          <span className="truncate block max-w-[600px]">{event.message ?? ''}</span>
        )}
      </td>
    </tr>
  )
}

// ── Step status summary ───────────────────────────────────────────────────────

type StepSummaryItem = { label: string; count: number; cls: string }

function StepSummary({ stats }: { stats: RunStats | null }) {
  if (!stats) return null
  const items: StepSummaryItem[] = [
    { label: 'Preparing', count: 0, cls: 'text-muted-foreground' },
    { label: 'Executing', count: 0, cls: 'text-blue-500' },
    { label: 'Errored',   count: stats.steps_failed ?? 0, cls: 'text-red-500' },
    { label: 'Succeeded', count: stats.steps_succeeded ?? 0, cls: 'text-green-500' },
  ]
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-xs">
          <span className={cn('font-medium', item.cls)}>{item.label} ({item.count})</span>
        </div>
      ))}
    </div>
  )
}

// ── Re-executions ─────────────────────────────────────────────────────────────

function ReExecutions({ rootRunId, runId }: { rootRunId: string | null; runId: string }) {
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    if (!rootRunId) return
    fetch(`/api/dagster/runs?limit=20`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { runs: Run[] }) => {
        const related = d.runs.filter(
          (r) => r.root_run_id === rootRunId || r.run_id === rootRunId,
        )
        setRuns(related)
      })
      .catch(() => {})
  }, [rootRunId])

  if (runs.length <= 1) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
        <span className="text-xs font-semibold">Re-executions ({runs.length})</span>
      </div>
      <div className="divide-y">
        {runs.map((r) => {
          const cfg = STATUS_CONFIG[r.status]
          const isThis = r.run_id === runId
          return (
            <Link
              key={r.run_id}
              href={`/pipelines/runs/${r.run_id}`}
              className={cn(
                'flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors',
                isThis && 'bg-muted/50',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {cfg && (
                  <HugeiconsIcon
                    icon={cfg.icon}
                    size={12}
                    className={cn(
                      ACTIVE_STATUSES.has(r.status) && 'animate-spin',
                      cfg.badgeCls.includes('green') ? 'text-green-500' :
                      cfg.badgeCls.includes('red') ? 'text-red-500' :
                      cfg.badgeCls.includes('blue') ? 'text-blue-500' : 'text-muted-foreground',
                    )}
                  />
                )}
                <span className="text-xs font-mono">{r.run_id.slice(0, 8)}</span>
                {r.root_run_id === null || r.root_run_id === r.run_id ? (
                  <span className="text-[10px] text-muted-foreground">ROOT</span>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0 ml-4">
                <span className="text-[10px] text-muted-foreground">{fmtTs(r.start_time ?? r.creation_time)}</span>
                <span className="text-[10px] text-muted-foreground">{fmtDuration(r.start_time, r.end_time)}</span>
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
          fetch(`/api/dagster/runs/${runId}`, { cache: 'no-store' }),
          fetch(`/api/dagster/runs/${runId}/events`, { cache: 'no-store' }),
        ])
        if (!runRes.ok) throw new Error(`HTTP ${runRes.status}`)
        const runData = (await runRes.json()) as Run
        const eventsData = (await eventsRes.json()) as EventsResponse

        if (!cancelled) {
          setRun(runData)
          setEvents(eventsData.events ?? [])
          setLoading(false)
          const active = ACTIVE_STATUSES.has(runData.status)
          timerRef.current = setTimeout(fetchAll, active ? 3000 : 30000)
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
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [runId])

  return { run, events, loading, error }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const params = useParams()
  const runId = typeof params.run_id === 'string' ? params.run_id : (params.run_id as string[])[0]

  const { run, events, loading, error } = useRunDetail(runId)
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'config'>('events')

  const filteredEvents = selectedStep
    ? events.filter((e) => !e.step_key || e.step_key === selectedStep)
    : events

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading run…
      </div>
    )
  }
  if (error || !run) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">
        {error ?? 'Run not found'}
      </div>
    )
  }

  const totalSteps = (run.stats?.steps_succeeded ?? 0) + (run.stats?.steps_failed ?? 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 border-b shrink-0 py-3">
        <Link
          href="/pipelines/runs"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Runs
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-xs font-mono font-semibold truncate">{runId.slice(0, 8)}…</span>
        <RunStatusBadge status={run.status} />
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">{run.job_name}</span>
          <span className="text-xs text-muted-foreground">{fmtTs(run.start_time ?? run.creation_time)}</span>
          <span className="text-xs text-muted-foreground">{fmtDuration(run.start_time, run.end_time)}</span>
          {totalSteps > 0 && (
            <span className="text-xs text-muted-foreground">
              {run.stats?.steps_succeeded ?? 0}/{totalSteps} steps
            </span>
          )}
        </div>
      </div>

      {/* Main split: graph + right sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: graph + event log */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Step graph */}
          <div className="h-52 border-b shrink-0 relative">
            <StepGraph
              events={events}
              selectedKey={selectedStep}
              onSelectStep={setSelectedStep}
            />
            {selectedStep && (
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="absolute top-2 right-2 text-[10px] px-2 py-1 border rounded bg-background hover:bg-muted text-muted-foreground z-10"
              >
                Clear filter
              </button>
            )}
          </div>

          {/* Tabs: Events / Config */}
          <div className="flex items-center border-b px-4 gap-4 shrink-0">
            {(['events', 'config'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={cn(
                  'text-xs py-2 capitalize border-b-2 transition-colors',
                  activeTab === t
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'events' ? `Events (${filteredEvents.length})` : 'Config'}
              </button>
            ))}
            {selectedStep && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                Filtered to step: <span className="font-mono">{selectedStep}</span>
              </span>
            )}
          </div>

          {/* Event log */}
          {activeTab === 'events' && (
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Timestamp</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">OP</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Event Type</th>
                    <th className="px-3 py-2 font-medium">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        No events
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((e, i) => (
                      <EventRow
                        key={i}
                        event={e}
                        highlight={!!selectedStep && e.step_key === selectedStep}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Config tab */}
          {activeTab === 'config' && (
            <div className="flex-1 overflow-auto min-h-0 p-4">
              {run.run_config_yaml ? (
                <pre className="text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed">
                  {run.run_config_yaml}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No run config</p>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-64 border-l shrink-0 overflow-y-auto">
          <div className="px-4 py-4 flex flex-col gap-4">

            {/* Step counts */}
            <div>
              <p className="text-xs font-semibold mb-2">Execution</p>
              <StepSummary stats={run.stats} />
            </div>

            <div className="h-px bg-border" />

            {/* Run details */}
            <div>
              <p className="text-xs font-semibold mb-2">Details</p>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Run ID</span>
                  <span className="font-mono truncate">{runId.slice(0, 8)}…</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Job</span>
                  <span className="font-mono truncate">{run.job_name}</span>
                </div>
                {run.parent_run_id && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Parent</span>
                    <Link
                      href={`/pipelines/runs/${run.parent_run_id}`}
                      className="font-mono text-blue-500 hover:underline truncate"
                    >
                      {run.parent_run_id.slice(0, 8)}…
                    </Link>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Started</span>
                  <span className="text-right">{fmtTs(run.start_time)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Duration</span>
                  <span>{fmtDuration(run.start_time, run.end_time)}</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            {run.tags.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <div>
                  <p className="text-xs font-semibold mb-2">Tags</p>
                  <div className="flex flex-col gap-1">
                    {run.tags
                      .filter((t) => !t.key.startsWith('dagster/'))
                      .map((t, i) => (
                        <div key={i} className="text-[10px] font-mono bg-muted rounded px-2 py-1 break-all">
                          {t.key}{t.value ? `=${t.value}` : ''}
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}

            <div className="h-px bg-border" />

            {/* Re-executions */}
            <ReExecutions rootRunId={run.root_run_id} runId={runId} />

          </div>
        </div>
      </div>
    </div>
  )
}
