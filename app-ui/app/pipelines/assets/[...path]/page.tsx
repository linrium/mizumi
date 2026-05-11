'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status'
dayjs.extend(relativeTime)

const LineageGraph = dynamic(
  () => import('./LineageGraph').then((m) => m.LineageGraph),
  { ssr: false },
)

// ── Types ─────────────────────────────────────────────────────────────────────

type RunTag = { key: string; value: string }

type StaleCause = {
  key: string[]
  reason: string
  dependency: string[] | null
  category: string
}

type MetadataEntry = {
  label: string
  type: string
  value: unknown
}

type Materialization = {
  timestamp: string
  run_id: string
  tags: RunTag[]
  metadata: MetadataEntry[]
}

type AssetNodeDetail = {
  path: string[]
  compute_kind: string | null
  description: string | null
  group_name: string | null
  is_observable: boolean
  is_executable: boolean
  job_names: string[]
  dependency_keys: string[][]
  depended_by_keys: string[][]
  stale_status: string | null
  stale_causes: StaleCause[]
  materializations: Materialization[]
  tags: RunTag[]
  repository_location: string | null
}

type LatestRunInfo = {
  run_id: string
  status: string
  start_time: number | null
  end_time: number | null
}

type LatestMatInfo = {
  timestamp: string
  run_id: string
}

type AssetStatus = {
  latest_run: LatestRunInfo | null
  latest_materialization: LatestMatInfo | null
  unstarted_run_ids: string[]
  in_progress_run_ids: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDayjs(ts: string | number | null | undefined) {
  if (ts === null || ts === undefined || ts === '') return null
  const v = Number(ts)
  if (!isFinite(v)) return null
  return v > 1e12 ? dayjs(v) : dayjs.unix(v)
}

function fmtTimestamp(ts: string | number | null | undefined): string {
  const d = toDayjs(ts)
  return d ? d.format('MMM D, h:mm A') : '—'
}

function fmtRelativeTime(ts: string | number | null | undefined): string {
  const d = toDayjs(ts)
  return d ? d.fromNow() : '—'
}

function fmtDuration(startSec: number | null, endSec: number | null): string {
  if (!startSec) return '—'
  const sec = Math.round((endSec ?? Date.now() / 1000) - startSec)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function fmtMetadataValue(entry: MetadataEntry): string {
  if (entry.value === null || entry.value === undefined) return '—'
  if (entry.type === 'json') {
    try { return JSON.stringify(JSON.parse(entry.value as string), null, 2) }
    catch { return String(entry.value) }
  }
  return String(entry.value)
}

function extractKinds(tags: RunTag[] | undefined): string[] {
  return (tags ?? [])
    .filter((t) => t.key.startsWith('dagster/kind/'))
    .map((t) => t.key.replace('dagster/kind/', ''))
}

const ACTIVE_STATUSES = new Set(['QUEUED', 'STARTED', 'STARTING', 'CANCELING'])

type RunStatusConfig = { label: string; variant: 'success' | 'error' | 'info' | 'warning' | 'default'; bannerCls: string }

const RUN_STATUS_CONFIG: Record<string, RunStatusConfig> = {
  SUCCESS:  { label: 'Success',   variant: 'success', bannerCls: 'bg-green-100  text-green-700  dark:bg-green-950  dark:text-green-400' },
  FAILURE:  { label: 'Failed',    variant: 'error',   bannerCls: 'bg-red-100    text-red-700    dark:bg-red-950    dark:text-red-400' },
  STARTED:  { label: 'Running',   variant: 'info',    bannerCls: 'bg-blue-100   text-blue-700   dark:bg-blue-950   dark:text-blue-400' },
  STARTING: { label: 'Starting',  variant: 'info',    bannerCls: 'bg-blue-100   text-blue-700   dark:bg-blue-950   dark:text-blue-400' },
  QUEUED:   { label: 'Queued',    variant: 'default', bannerCls: 'bg-muted      text-muted-foreground' },
  CANCELING:{ label: 'Canceling', variant: 'warning', bannerCls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400' },
  CANCELED: { label: 'Canceled',  variant: 'default', bannerCls: 'bg-muted      text-muted-foreground' },
}

const STALE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
  FRESH:   { label: 'Fresh',   variant: 'success' },
  STALE:   { label: 'Stale',   variant: 'warning' },
  MISSING: { label: 'Missing', variant: 'error' },
  UNKNOWN: { label: 'Unknown', variant: 'default' },
}

const VARIANT_DOT_CLS: Record<string, string> = {
  success: 'bg-green-600 dark:bg-green-400',
  error:   'bg-destructive',
  info:    'bg-blue-600 dark:bg-blue-400',
  warning: 'bg-orange-600 dark:bg-orange-400',
  default: 'bg-muted-foreground',
}

function StaleStatusBadge({ status }: { status: string }) {
  const cfg = STALE_CONFIG[status]
  if (!cfg) return <Badge variant="outline">{status}</Badge>
  return (
    <Status variant={cfg.variant}>
      <StatusIndicator />
      <StatusLabel>{cfg.label}</StatusLabel>
    </Status>
  )
}

// ── useAssetStatus hook ────────────────────────────────────────────────────────

function useAssetStatus(pathSegments: string[]) {
  const [status, setStatus] = useState<AssetStatus | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathKey = pathSegments.join('/')

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/dagster/asset-status/${pathKey}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as AssetStatus
        if (!cancelled) {
          setStatus(data)
          const isActive =
            data.in_progress_run_ids.length > 0 ||
            data.unstarted_run_ids.length > 0 ||
            (data.latest_run !== null && ACTIVE_STATUSES.has(data.latest_run.status))
          timerRef.current = setTimeout(poll, isActive ? 3000 : 10000)
        }
      } catch {
        if (!cancelled) {
          timerRef.current = setTimeout(poll, 10000)
        }
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey])

  return status
}

// ── ElapsedTime — re-renders every second while a run is active ───────────────

function ElapsedTime({ startSec }: { startSec: number }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return <>{fmtDuration(startSec, null)}</>
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

// ── Sidebar section ────────────────────────────────────────────────────────────

function SideSection({
  title,
  children,
  collapsed,
}: {
  title: string
  children?: React.ReactNode
  collapsed?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[10px] text-muted-foreground">{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && children}
    </div>
  )
}

// ── CurrentRunBanner ──────────────────────────────────────────────────────────

function CurrentRunBanner({ liveStatus }: { liveStatus: AssetStatus }) {
  const run = liveStatus.latest_run
  const isActive =
    liveStatus.in_progress_run_ids.length > 0 ||
    liveStatus.unstarted_run_ids.length > 0 ||
    (run !== null && ACTIVE_STATUSES.has(run.status))

  if (!run) return null

  const cfg = RUN_STATUS_CONFIG[run.status]
  const bannerCls = cfg?.bannerCls ?? 'bg-muted text-muted-foreground'

  return (
    <div className={cn('rounded-md px-3 py-2.5 flex items-center justify-between gap-3', bannerCls)}>
      <div className="flex items-center gap-2 min-w-0">
        {cfg && <StatusIndicator className={cn('shrink-0', VARIANT_DOT_CLS[cfg.variant])} />}
        <span className="text-xs font-medium">{cfg?.label ?? run.status}</span>
        <span className="text-[10px] font-mono opacity-70 truncate">{run.run_id.slice(0, 8)}…</span>
      </div>
      <div className="text-[10px] shrink-0 opacity-80">
        {isActive && run.start_time ? (
          <ElapsedTime startSec={run.start_time} />
        ) : (
          fmtDuration(run.start_time, run.end_time)
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const params = useParams()
  const rawPath = params.path
  const pathSegments = (Array.isArray(rawPath) ? rawPath : [rawPath])
    .filter(Boolean)
    .map((s) => decodeURIComponent(s!))

  const [tab, setTab] = useState<'overview' | 'lineage'>('overview')
  const [detail, setDetail] = useState<AssetNodeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metaFilter, setMetaFilter] = useState('')
  const [materializing, setMaterializing] = useState(false)

  const liveStatus = useAssetStatus(pathSegments)

  async function handleMaterialize() {
    setMaterializing(true)
    try {
      const res = await fetch(`/api/dagster/materialize/${pathSegments.join('/')}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast.success('Materialization started', { description: `Run ${(json.run_id as string).slice(0, 8)}…` })
    } catch (err) {
      toast.error('Failed to materialize', { description: (err as Error).message })
    } finally {
      setMaterializing(false)
    }
  }

  useEffect(() => {
    const url = `/api/dagster/asset-nodes/${pathSegments.join('/')}`
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        return json as AssetNodeDetail
      })
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathSegments.join('/')])

  const assetName = pathSegments[pathSegments.length - 1]
  const latestMat = detail?.materializations[0]
  const kinds = detail ? extractKinds(detail.tags) : []

  // Prefer live materialization timestamp if newer than the static detail fetch
  const liveMat = liveStatus?.latest_materialization
  const latestMatTimestamp = liveMat?.timestamp ?? latestMat?.timestamp

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 border-b shrink-0">
        <Link
          href="/pipelines"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 py-3"
        >
          Assets
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-xs font-semibold truncate py-3">{assetName}</span>

        {/* Tabs */}
        <div className="flex ml-2">
          {(['overview', 'lineage'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-3 text-xs capitalize border-b-2 transition-colors',
                tab === t
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {detail?.stale_status && (
            <StaleStatusBadge status={detail.stale_status} />
          )}
          {detail?.is_executable && (
            <button
              type="button"
              onClick={handleMaterialize}
              disabled={materializing}
              className="text-xs px-3 py-1 border rounded-md bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {materializing ? 'Starting…' : 'Materialize'}
            </button>
          )}
        </div>
      </div>

      {/* Lineage tab — full-bleed graph, no sidebar */}
      {tab === 'lineage' && (
        <div className="flex-1 min-h-0 relative">
          <LineageGraph currentPath={pathSegments} neighborhoodOnly />
        </div>
      )}

      {/* Overview tab */}
      {tab === 'overview' && loading && (
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          Loading…
        </div>
      )}
      {tab === 'overview' && error && (
        <div className="flex items-center justify-center flex-1 text-sm text-destructive font-mono px-6 text-center">
          {error}
        </div>
      )}

      {/* Two-column layout */}
      {tab === 'overview' && detail && (
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-5 flex flex-col gap-4">

              {/* Status */}
              <Section title="Status">
                <div className="flex flex-col gap-3">

                  {/* Live run banner */}
                  {liveStatus && <CurrentRunBanner liveStatus={liveStatus} />}

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Latest materialization</span>
                    {latestMatTimestamp ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="text-xs">{fmtRelativeTime(latestMatTimestamp)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never</span>
                    )}
                  </div>

                  {detail.materializations.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground">Recent updates</span>
                        <span className="text-[10px] text-muted-foreground">
                          Showing all {detail.materializations.length} update{detail.materializations.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-end gap-0.5 h-5">
                        {detail.materializations
                          .slice()
                          .reverse()
                          .map((_, i) => (
                            <div key={i} className="w-2 h-3 bg-green-500 rounded-sm" />
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Description */}
              <Section title="Description">
                {detail.description ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{detail.description}</p>
                ) : (
                  <div className="py-1">
                    <p className="text-sm font-medium">No description found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You can add a description to any asset by adding a &apos;description&apos; argument to it.
                    </p>
                  </div>
                )}
              </Section>

              {/* Metadata — from latest materialization */}
              {latestMat && latestMat.metadata.length > 0 && (
                <Section title="Metadata">
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Filter metadata keys"
                      value={metaFilter}
                      onChange={(e) => setMetaFilter(e.target.value)}
                      className="text-xs px-2.5 py-1.5 border rounded-md bg-background w-full sm:w-52 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Key</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Timestamp</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {latestMat.metadata
                            .filter(
                              (e) =>
                                !metaFilter ||
                                e.label.toLowerCase().includes(metaFilter.toLowerCase()),
                            )
                            .map((entry, i) => (
                              <tr key={i} className="align-top">
                                <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">
                                  {entry.label}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="text-blue-400 text-[10px]">⊕</span>
                                    {fmtTimestamp(latestMat.timestamp)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-foreground break-all whitespace-pre-wrap max-w-xs">
                                  {fmtMetadataValue(entry)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>
              )}

              {/* Lineage */}
              {(detail.dependency_keys.length > 0 || detail.depended_by_keys.length > 0) && (
                <Section title="Lineage">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Upstream assets</p>
                      {detail.dependency_keys.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {detail.dependency_keys.map((k, i) => (
                            <Link
                              key={i}
                              href={`/pipelines/assets/${k.join('/')}`}
                              className="inline-flex items-center gap-1.5 text-xs font-mono text-green-600 dark:text-green-400 hover:underline w-fit"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                              {k[k.length - 1]}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Downstream assets</p>
                      {detail.depended_by_keys.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {detail.depended_by_keys.map((k, i) => (
                            <Link
                              key={i}
                              href={`/pipelines/assets/${k.join('/')}`}
                              className="inline-flex items-center gap-1.5 text-xs font-mono hover:underline w-fit"
                            >
                              {k[k.length - 1]}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {/* Stale causes */}
              {detail.stale_causes.length > 0 && (
                <Section title="Stale Causes">
                  <div className="flex flex-col gap-2">
                    {detail.stale_causes.map((c, i) => (
                      <div key={i} className="flex flex-col gap-0.5 border rounded-md px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">{c.key.join('/')}</span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {c.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{c.reason}</p>
                        {c.dependency && (
                          <p className="text-[10px] text-muted-foreground">
                            dep: <span className="font-mono">{c.dependency.join('/')}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Previous materializations */}
              {detail.materializations.length > 1 && (
                <Section title={`Previous materializations (${detail.materializations.length - 1})`}>
                  <div className="divide-y">
                    {detail.materializations.slice(1).map((m, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs">{fmtTimestamp(m.timestamp)}</span>
                          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
                            {m.run_id}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {m.metadata.length} entries
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="w-64 border-l shrink-0 overflow-y-auto">
            <div className="px-4 py-5 flex flex-col gap-5">

              {/* Definition */}
              <SideSection title="Definition">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Group</p>
                    <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                      <span className="text-blue-400">▦</span>
                      {detail.group_name ?? '—'}
                    </span>
                  </div>

                  {detail.repository_location && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Code location
                      </p>
                      <span className="text-xs text-blue-500">{detail.repository_location}</span>
                    </div>
                  )}

                  {kinds.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Kinds</p>
                      <div className="flex flex-wrap gap-1">
                        {kinds.map((kind) => (
                          <span
                            key={kind}
                            className="inline-flex items-center text-[10px] border px-1.5 py-0.5 rounded-full font-medium capitalize"
                          >
                            {kind}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(detail.tags ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {(detail.tags ?? []).map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono break-all"
                          >
                            {tag.key}
                            {tag.value ? `=${tag.value}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SideSection>

              <div className="h-px bg-border" />

              {/* Automation details */}
              <SideSection title="Automation details">
                <div className="rounded-md border px-3 py-3">
                  <p className="text-xs font-medium">No automations found for this asset</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    Dagster offers several ways to run data pipelines without manual intervention,
                    including traditional scheduling and event-based triggers.
                  </p>
                </div>
              </SideSection>

              <div className="h-px bg-border" />

              {/* Compute details */}
              <SideSection title="Compute details" collapsed />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
