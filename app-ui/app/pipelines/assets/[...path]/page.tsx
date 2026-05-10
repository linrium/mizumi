'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  tags: { key: string; value: string }[]
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | number | null | undefined): string {
  if (!ts) return '—'
  const ms = typeof ts === 'string' ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleString()
}

function fmtMetadataValue(entry: MetadataEntry): string {
  if (entry.value === null || entry.value === undefined) return '—'
  if (entry.type === 'json') {
    try { return JSON.stringify(JSON.parse(entry.value as string), null, 2) }
    catch { return String(entry.value) }
  }
  return String(entry.value)
}

const STALE_LABEL: Record<string, string> = {
  FRESH:   '✓ Fresh',
  STALE:   '⚠ Stale',
  MISSING: '✗ Missing',
  UNKNOWN: '? Unknown',
}

const STALE_CLS: Record<string, string> = {
  FRESH:   'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  STALE:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  MISSING: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{title}</h2>
      {children}
    </div>
  )
}

function MetaGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className="text-sm font-mono">{value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function MatCard({ mat, defaultOpen }: { mat: Materialization; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm">{fmtTimestamp(mat.timestamp)}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{mat.run_id}</span>
        </div>
        <span className="text-muted-foreground ml-4 shrink-0 text-[10px]">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="border-t">
          {mat.metadata.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">No metadata</p>
          ) : (
            <div className="divide-y">
              {mat.metadata.map((entry, i) => (
                <div key={i} className="px-4 py-2.5 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{entry.label}</span>
                  <span className="text-xs font-mono break-all whitespace-pre-wrap">{fmtMetadataValue(entry)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const params = useParams()
  const rawPath = params.path
  const pathSegments = (Array.isArray(rawPath) ? rawPath : [rawPath]).map(decodeURIComponent)

  const [detail, setDetail] = useState<AssetNodeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [pathSegments.join('/')])

  const assetName = pathSegments[pathSegments.length - 1]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0">
        <Link
          href="/pipelines"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          ← Pipelines
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-xs font-semibold truncate">{assetName}</span>
        {detail?.stale_status && (
          <span className={cn(
            'ml-auto shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full',
            STALE_CLS[detail.stale_status] ?? STALE_CLS.UNKNOWN,
          )}>
            {STALE_LABEL[detail.stale_status] ?? detail.stale_status}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-32 text-sm text-destructive font-mono px-6 text-center">
            {error}
          </div>
        )}
        {detail && (
          <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-8">
            {/* Overview */}
            <Section title="Overview">
              <MetaGrid items={[
                { label: 'Group',      value: detail.group_name ?? '—' },
                { label: 'Kind',       value: detail.compute_kind ?? '—' },
                { label: 'Upstream',   value: detail.dependency_keys.length ? String(detail.dependency_keys.length) : '—' },
                { label: 'Downstream', value: detail.depended_by_keys.length ? String(detail.depended_by_keys.length) : '—' },
                ...(detail.job_names.length > 0
                  ? [{ label: 'Jobs', value: detail.job_names.join(', ') }]
                  : []),
              ]} />
            </Section>

            {/* Description */}
            {detail.description && (
              <Section title="Description">
                <p className="text-sm text-muted-foreground leading-relaxed">{detail.description}</p>
              </Section>
            )}

            {/* Dependencies */}
            {(detail.dependency_keys.length > 0 || detail.depended_by_keys.length > 0) && (
              <Section title="Dependencies">
                <div className="flex flex-col gap-4">
                  {detail.dependency_keys.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Upstream ({detail.dependency_keys.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.dependency_keys.map((k, i) => (
                          <Link
                            key={i}
                            href={`/pipelines/assets/${k.join('/')}`}
                            className="text-xs font-mono bg-muted px-2 py-0.5 rounded hover:bg-muted/70 transition-colors"
                          >
                            {k.join('/')}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.depended_by_keys.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Downstream ({detail.depended_by_keys.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.depended_by_keys.map((k, i) => (
                          <Link
                            key={i}
                            href={`/pipelines/assets/${k.join('/')}`}
                            className="text-xs font-mono bg-muted px-2 py-0.5 rounded hover:bg-muted/70 transition-colors"
                          >
                            {k.join('/')}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Stale causes */}
            {detail.stale_causes.length > 0 && (
              <Section title="Stale Causes">
                <div className="flex flex-col gap-2">
                  {detail.stale_causes.map((c, i) => (
                    <div key={i} className="flex flex-col gap-0.5 border rounded-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{c.key.join('/')}</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{c.category}</span>
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

            {/* Materializations */}
            <Section title={`Materializations${detail.materializations.length ? ` (${detail.materializations.length})` : ''}`}>
              {detail.materializations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materializations yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {detail.materializations.map((m, i) => (
                    <MatCard key={i} mat={m} defaultOpen={i === 0} />
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}
