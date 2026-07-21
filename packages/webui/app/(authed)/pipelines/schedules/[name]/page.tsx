"use client"

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import { cn } from "@/lib/utils"

dayjs.extend(relativeTime)

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleTick {
  status: string
  timestamp: number
}

interface Schedule {
  cron_schedule: string
  default_status: string | null
  description: string | null
  execution_timezone: string | null
  job_name: string | null
  last_tick: ScheduleTick | null
  name: string
  next_tick: number | null
  status: string | null
}

interface ScheduleAsset {
  compute_kind: string | null
  description: string | null
  group_name: string | null
  is_executable: boolean
  is_observable: boolean
  job_names: string[]
  key: string[]
}

interface ScheduleAssetSelection {
  asset_selection_string: string | null
  assets: ScheduleAsset[]
  schedule_name: string
}

interface TickRun {
  id: string
  status: string
}

interface TickError {
  message: string
  stack: string[]
}

interface DynamicPartitionsResult {
  partition_keys: string[]
  partitions_def_name: string
  result_type: string
  skipped_partition_keys: string[]
}

interface HistoryTick {
  cursor: string | null
  dynamic_partitions_request_results: DynamicPartitionsResult[]
  end_timestamp: number | null
  error: TickError | null
  id: string
  instigation_type: string | null
  log_key: string[] | null
  origin_run_ids: string[]
  requested_asset_materialization_count: number | null
  run_ids: string[]
  runs: TickRun[]
  skip_reason: string | null
  status: string
  tick_id: string | null
  timestamp: number
}

interface TickHistoryResponse {
  id: string
  instigation_type: string | null
  ticks: HistoryTick[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(`/api/dagster/${path}`, { cache: "no-store" })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }
  return json as T
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) {
    return "—"
  }
  return dayjs(ts * 1000).format("MMM D, h:mm:ss A")
}

function fmtTsRel(ts: number | null | undefined): string {
  if (!ts) {
    return ""
  }
  return dayjs(ts * 1000).fromNow()
}

function fmtDuration(start: number, end: number | null | undefined): string {
  if (!end) {
    return "—"
  }
  const ms = (end - start) * 1000
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

const TICK_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "success" | "error" | "warning" | "default" }
> = {
  FAILURE: { label: "Failed", variant: "error" },
  SKIPPED: { label: "Skipped", variant: "warning" },
  STARTED: { label: "Started", variant: "default" },
  SUCCESS: { label: "Success", variant: "success" },
}

const SCHEDULE_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "success" | "default" }
> = {
  RUNNING: { label: "Running", variant: "success" },
  STOPPED: { label: "Stopped", variant: "default" },
}

const RUN_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "success" | "error" | "warning" | "default" }
> = {
  CANCELED: { label: "Canceled", variant: "warning" },
  CANCELING: { label: "Canceling", variant: "warning" },
  FAILURE: { label: "Failed", variant: "error" },
  NOT_STARTED: { label: "Not Started", variant: "default" },
  QUEUED: { label: "Queued", variant: "default" },
  RUNNING: { label: "Running", variant: "default" },
  STARTED: { label: "Started", variant: "default" },
  STARTING: { label: "Starting", variant: "default" },
  SUCCESS: { label: "Success", variant: "success" },
}

// ── DetailRow ─────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

// ── AssetCard ─────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: ScheduleAsset }) {
  const name = asset.key.at(-1)
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono font-semibold text-xs">{name}</span>
        {asset.compute_kind && (
          <Badge className="shrink-0 px-1.5 py-0 text-[9px]" variant="outline">
            {asset.compute_kind}
          </Badge>
        )}
        {!asset.is_executable && (
          <Badge
            className="shrink-0 px-1.5 py-0 text-[9px] text-muted-foreground"
            variant="outline"
          >
            observable
          </Badge>
        )}
      </div>
      {asset.key.length > 1 && (
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {asset.key.join(" / ")}
        </span>
      )}
      {asset.group_name && (
        <span className="text-[10px] text-muted-foreground">
          Group: {asset.group_name}
        </span>
      )}
      {asset.description && (
        <span className="line-clamp-3 text-[10px] text-muted-foreground leading-relaxed">
          {asset.description}
        </span>
      )}
      {asset.job_names.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {asset.job_names.map((j) => (
            <Badge
              className="px-1.5 py-0 font-mono text-[9px]"
              key={j}
              variant="secondary"
            >
              {j}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TickRow ───────────────────────────────────────────────────────────────────

function TickRow({ tick }: { tick: HistoryTick }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = TICK_STATUS_CONFIG[tick.status]
  const hasDetail =
    !!tick.error || !!tick.skip_reason || tick.run_ids.length > 0

  return (
    <>
      <tr
        className={cn(
          "border-b text-xs transition-colors",
          hasDetail && "cursor-pointer hover:bg-muted/30"
        )}
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <td className="px-4 py-2.5">
          {cfg ? (
            <Status variant={cfg.variant}>
              <StatusIndicator />
              <StatusLabel>{cfg.label}</StatusLabel>
            </Status>
          ) : (
            <span className="text-muted-foreground">{tick.status}</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span title={fmtTs(tick.timestamp)}>{fmtTsRel(tick.timestamp)}</span>
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {fmtTs(tick.timestamp)}
          </span>
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {fmtDuration(tick.timestamp, tick.end_timestamp)}
        </td>
        <td className="px-4 py-2.5">
          {tick.runs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tick.runs.map((r) => {
                const rc = RUN_STATUS_CONFIG[r.status]
                return (
                  <span className="flex items-center gap-1" key={r.id}>
                    {rc ? (
                      <Status variant={rc.variant}>
                        <StatusIndicator />
                        <StatusLabel>{r.id.slice(0, 8)}</StatusLabel>
                      </Status>
                    ) : (
                      <code className="font-mono text-[10px] text-muted-foreground">
                        {r.id.slice(0, 8)}
                      </code>
                    )}
                  </span>
                )
              })}
            </div>
          ) : tick.run_ids.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tick.run_ids.map((id) => (
                <code
                  className="font-mono text-[10px] text-muted-foreground"
                  key={id}
                >
                  {id.slice(0, 8)}
                </code>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground">
          {tick.skip_reason ??
            (tick.error ? (
              <span className="text-destructive">
                {tick.error.message.split("\n")[0]}
              </span>
            ) : (
              "—"
            ))}
        </td>
      </tr>
      {expanded && hasDetail && (
        <tr className="border-b bg-muted/20">
          <td className="px-4 py-3" colSpan={5}>
            {tick.error && (
              <div className="mb-2">
                <p className="mb-1 font-semibold text-[10px] text-destructive">
                  Error
                </p>
                <pre className="whitespace-pre-wrap font-mono text-[10px] text-destructive leading-relaxed">
                  {tick.error.message}
                  {tick.error.stack.length > 0 &&
                    `\n\nStack:\n${tick.error.stack.join("\n")}`}
                </pre>
              </div>
            )}
            {tick.skip_reason && (
              <p className="text-[10px] text-muted-foreground">
                {tick.skip_reason}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "assets" | "ticks"

export default function ScheduleDetailPage() {
  const params = useParams()
  const name = decodeURIComponent(
    typeof params.name === "string" ? params.name : (params.name as string[])[0]
  )

  const [tab, setTab] = useState<Tab>("assets")
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [assetSelection, setAssetSelection] =
    useState<ScheduleAssetSelection | null>(null)
  const [tickHistory, setTickHistory] = useState<TickHistoryResponse | null>(
    null
  )
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [loadingTicks, setLoadingTicks] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ schedules: Schedule[] }>("schedules")
      .then((d) => {
        const found = d.schedules.find((s) => s.name === name) ?? null
        setSchedule(found)
        if (!found) {
          setError("Schedule not found")
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingSchedule(false))
  }, [name])

  useEffect(() => {
    apiFetch<ScheduleAssetSelection>(
      `schedule-assets/${encodeURIComponent(name)}`
    )
      .then(setAssetSelection)
      .catch(() =>
        setAssetSelection({
          asset_selection_string: null,
          assets: [],
          schedule_name: name,
        })
      )
      .finally(() => setLoadingAssets(false))
  }, [name])

  useEffect(() => {
    if (tab !== "ticks" || tickHistory) {
      return
    }
    setLoadingTicks(true)
    apiFetch<TickHistoryResponse>(
      `schedules/${encodeURIComponent(name)}/ticks?limit=50`
    )
      .then(setTickHistory)
      .catch(() =>
        setTickHistory({ id: "", instigation_type: null, ticks: [] })
      )
      .finally(() => setLoadingTicks(false))
  }, [tab, name, tickHistory])

  if (loadingSchedule) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }
  if (error || !schedule) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-destructive text-sm">
        {error ?? "Schedule not found"}
      </div>
    )
  }

  const statusCfg = schedule.status
    ? SCHEDULE_STATUS_CONFIG[schedule.status]
    : null
  const tickCfg = schedule.last_tick
    ? TICK_STATUS_CONFIG[schedule.last_tick.status]
    : null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <Link
          className="text-muted-foreground text-xs transition-colors hover:text-foreground"
          href="/pipelines/schedules"
        >
          Schedules
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="font-mono font-semibold text-xs">{name}</span>
        {statusCfg && (
          <Status variant={statusCfg.variant}>
            <StatusIndicator />
            <StatusLabel>{statusCfg.label}</StatusLabel>
          </Status>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex shrink-0 items-center gap-0 border-b px-3">
            {(["assets", "ticks"] as Tab[]).map((t) => (
              <button
                className={cn(
                  "-mb-px border-b-2 px-3 py-2.5 font-medium text-xs capitalize transition-colors",
                  tab === t
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                key={t}
                onClick={() => setTab(t)}
              >
                {t === "assets" ? "Assets" : "Tick History"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-auto">
            {tab === "assets" && (
              <div className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <p className="font-semibold text-sm">Assets</p>
                  {assetSelection?.asset_selection_string && (
                    <code className="rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {assetSelection.asset_selection_string}
                    </code>
                  )}
                  {!loadingAssets && assetSelection && (
                    <span className="ml-auto text-muted-foreground text-xs">
                      {assetSelection.assets.length} asset
                      {assetSelection.assets.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {loadingAssets ? (
                  <div className="text-muted-foreground text-sm">
                    Loading assets…
                  </div>
                ) : assetSelection && assetSelection.assets.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                    {assetSelection.assets.map((asset) => (
                      <AssetCard asset={asset} key={asset.key.join("/")} />
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    No assets in this schedule's selection.
                  </div>
                )}
              </div>
            )}

            {tab === "ticks" &&
              (loadingTicks ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
                  Loading ticks…
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 border-b bg-background">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Timestamp</th>
                      <th className="px-4 py-2.5 font-medium">Duration</th>
                      <th className="px-4 py-2.5 font-medium">Runs</th>
                      <th className="px-4 py-2.5 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickHistory && tickHistory.ticks.length > 0 ? (
                      tickHistory.ticks.map((tick) => (
                        <TickRow key={tick.id} tick={tick} />
                      ))
                    ) : (
                      <tr>
                        <td
                          className="px-4 py-8 text-center text-muted-foreground"
                          colSpan={5}
                        >
                          No tick history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ))}
          </div>
        </div>

        {/* Sidebar: schedule metadata */}
        <div className="w-64 shrink-0 overflow-y-auto border-l">
          <div className="flex flex-col gap-4 px-4 py-4">
            <div>
              <p className="mb-2 font-semibold text-xs">Schedule</p>
              <div className="flex flex-col gap-2">
                <DetailRow label="Cron">
                  <code className="font-mono">{schedule.cron_schedule}</code>
                </DetailRow>
                <DetailRow label="Timezone">
                  {schedule.execution_timezone ?? "UTC"}
                </DetailRow>
                <DetailRow label="Default">
                  {schedule.default_status ?? "—"}
                </DetailRow>
                {schedule.job_name && (
                  <DetailRow label="Target">
                    <code className="font-mono text-[10px]">
                      {schedule.job_name}
                    </code>
                  </DetailRow>
                )}
              </div>
            </div>

            {schedule.next_tick !== null && (
              <>
                <Separator />
                <div>
                  <p className="mb-2 font-semibold text-xs">Next Tick</p>
                  <div className="flex flex-col gap-2">
                    <DetailRow label="In">
                      <span title={fmtTs(schedule.next_tick)}>
                        {fmtTsRel(schedule.next_tick)}
                      </span>
                    </DetailRow>
                    <DetailRow label="At">
                      <span className="font-mono text-[10px]">
                        {fmtTs(schedule.next_tick)}
                      </span>
                    </DetailRow>
                  </div>
                </div>
              </>
            )}

            {schedule.last_tick && (
              <>
                <Separator />
                <div>
                  <p className="mb-2 font-semibold text-xs">Last Tick</p>
                  <div className="flex flex-col gap-2">
                    <DetailRow label="Result">
                      {tickCfg ? (
                        <Status variant={tickCfg.variant}>
                          <StatusIndicator />
                          <StatusLabel>{tickCfg.label}</StatusLabel>
                        </Status>
                      ) : (
                        schedule.last_tick.status
                      )}
                    </DetailRow>
                    <DetailRow label="Time">
                      <span title={fmtTs(schedule.last_tick.timestamp)}>
                        {fmtTsRel(schedule.last_tick.timestamp)}
                      </span>
                    </DetailRow>
                    <DetailRow label="At">
                      <span className="font-mono text-[10px]">
                        {fmtTs(schedule.last_tick.timestamp)}
                      </span>
                    </DetailRow>
                  </div>
                </div>
              </>
            )}

            {schedule.description && (
              <>
                <Separator />
                <div>
                  <p className="mb-2 font-semibold text-xs">Description</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {schedule.description}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
