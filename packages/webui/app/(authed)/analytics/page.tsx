"use client"

import { useChat } from "@ai-sdk/react"
import {
  IconArrowUp,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconDatabase,
  IconLoader2,
  IconSearch,
  IconShieldCheck,
  IconShieldLock,
  IconSparkles,
  IconTriangleSquareCircle,
} from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import { formatDistanceToNowStrict } from "date-fns"
import { useEffect, useMemo, useRef, useState } from "react"
import { Streamdown } from "streamdown"
import { Area, AreaChart } from "@/components/charts/area-chart"
import { Bar } from "@/components/charts/bar"
import { BarChart } from "@/components/charts/bar-chart"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { Grid } from "@/components/charts/grid"
import { PieChart } from "@/components/charts/pie-chart"
import type { PieData } from "@/components/charts/pie-context"
import { PieSlice } from "@/components/charts/pie-slice"
import type { SankeyData } from "@/components/charts/sankey/sankey-chart"
import { SankeyChart } from "@/components/charts/sankey/sankey-chart"
import { SankeyLink } from "@/components/charts/sankey/sankey-link"
import { SankeyNode } from "@/components/charts/sankey/sankey-node"
import { SankeyTooltip } from "@/components/charts/sankey/sankey-tooltip"
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip"
import { DataGrid } from "@/components/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDataGrid } from "@/hooks/use-data-grid"
import { cn } from "@/lib/utils"
import { MODELS, type ModelId } from "@/services/ai-models"
import {
  createPermissionRequest,
  listPermissionRequests,
  type PermissionRequest,
} from "@/services/permissions"

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunQueryOutput {
  columns?: string[]
  error?: string
  explanation: string
  row_count?: number
  rows?: unknown[][]
  sql: string
}

interface VisualizeChartOutput {
  chartType: "bar" | "line" | "area" | "pie" | "scatter" | "sankey"
  columns?: string[]
  error?: string
  explanation: string
  rows?: unknown[][]
  sql: string
  title: string
  x: string
  y: string
}

interface QueryResponse {
  columns: string[]
  row_count: number
  rows: unknown[][]
}
type Row = Record<string, unknown>

interface AccessRequestPreviewOutput {
  explanation: string
  privileges: string[]
  rationale: string
  resource: string
  scope: "catalog" | "schema" | "table"
  suggested_duration_days: number
}

interface RequestApprovalStep {
  approver_label: string
  approver_team: string
  id: string
  is_current: boolean
  stage_order: number
  status: string
}

interface RequestStatusOutput {
  approval_steps: RequestApprovalStep[]
  code: string
  error?: string
  expires_at: string
  expires_in_days: number
  id: string
  queue_decision: string
  rationale: string
  resource: string
  scope: string
  status: string
  submitted_at: string
}

interface RequestListItem {
  code: string
  expires_in_days: number
  id: string
  privileges: string[]
  queue_decision: string
  rationale: string
  resource: string
  scope: string
  status: string
  submitted_at: string
}

interface ListMyAccessRequestsOutput {
  error?: string
  requests: RequestListItem[]
}

interface ExploreCatalogTable {
  catalog: string
  description: string
  fqn: string
  schema: string
  table: string
}

interface ExploreCatalogOutput {
  catalogs: string[]
  inaccessible_catalogs: string[]
  inaccessible_tables: ExploreCatalogTable[]
  overview: string
  search: string | null
  tables: ExploreCatalogTable[]
}

// ── ResultsGrid ───────────────────────────────────────────────────────────────

function ResultsGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(220)

  useEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const ro = new ResizeObserver((e) => setHeight(e[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () =>
      queryResult.rows.map((row) =>
        Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]]))
      ),
    [queryResult]
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      queryResult.columns.map((col) => ({
        accessorKey: col,
        header: col,
        id: col,
        meta: { cell: { variant: "short-text" as const } },
        size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
      })),
    [queryResult]
  )

  const { table, ...dataGridProps } = useDataGrid<Row>({
    columns,
    data,
    readOnly: true,
  })

  return (
    <div className="overflow-hidden" ref={containerRef} style={{ height: 220 }}>
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

// ── QueryResultCard ───────────────────────────────────────────────────────────

function QueryResultCard({ output }: { output: RunQueryOutput }) {
  const [sqlOpen, setSqlOpen] = useState(false)

  const queryResult: QueryResponse | null =
    output.columns && output.rows
      ? {
          columns: output.columns,
          row_count: output.row_count ?? output.rows.length,
          rows: output.rows,
        }
      : null

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <button
        className="flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent/40"
        onClick={() => setSqlOpen((v) => !v)}
        type="button"
      >
        <IconChevronDown
          className={cn(
            "shrink-0 transition-transform",
            sqlOpen && "rotate-180"
          )}
          size={11}
        />
        <IconDatabase className="shrink-0" size={11} />
        <span className="flex-1 truncate text-left font-mono">
          {output.sql.slice(0, 72)}
          {output.sql.length > 72 ? "…" : ""}
        </span>
        {queryResult && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {queryResult.row_count}{" "}
            {queryResult.row_count === 1 ? "row" : "rows"}
          </span>
        )}
      </button>

      {sqlOpen && (
        <pre className="overflow-x-auto whitespace-pre-wrap border-b bg-muted/30 px-3 py-2 font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 font-mono text-destructive">
          {output.error}
        </div>
      )}

      {queryResult && <ResultsGrid queryResult={queryResult} />}
    </div>
  )
}

// ── VisualizationCard ─────────────────────────────────────────────────────────

const VIZ_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function VisualizationCard({ output }: { output: VisualizeChartOutput }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const [tab, setTab] = useState<"chart" | "data">("chart")

  const { keys, values } = useMemo(() => {
    if (!(output.columns && output.rows)) {
      return { keys: [], values: [] }
    }
    const xi = output.columns.indexOf(output.x)
    const yi = output.columns.indexOf(output.y)
    if (xi === -1 || yi === -1) {
      return { keys: [], values: [] }
    }
    const pairs = output.rows
      .map((r) => ({
        k: String(r[xi] ?? ""),
        v: Number.parseFloat(String(r[yi] ?? "")),
      }))
      .filter((d) => Number.isFinite(d.v))
    return { keys: pairs.map((d) => d.k), values: pairs.map((d) => d.v) }
  }, [output])

  const barData = useMemo(
    () => keys.map((k, i) => ({ [output.x]: k, [output.y]: values[i] ?? 0 })),
    [keys, values, output.x, output.y]
  )

  const areaData = useMemo(
    () =>
      keys.map((k, i) => {
        const parsed = new Date(k)
        return {
          [output.x]: Number.isNaN(parsed.getTime())
            ? new Date(i * 86_400_000)
            : parsed,
          [output.y]: values[i] ?? 0,
        }
      }),
    [keys, values, output.x, output.y]
  )

  const pieData = useMemo<PieData[]>(
    () => keys.map((k, i) => ({ label: k, value: values[i] ?? 0 })),
    [keys, values]
  )
  const pieTotal = useMemo(
    () => pieData.reduce((s, d) => s + d.value, 0),
    [pieData]
  )

  const sankeyData = useMemo<SankeyData>(() => {
    if (!(output.columns && output.rows)) {
      return { links: [], nodes: [] }
    }
    const srcIdx = output.columns.indexOf(output.x)
    const tgtIdx = output.columns.indexOf(output.y)
    const valIdx = output.columns.findIndex(
      (_, i) => i !== srcIdx && i !== tgtIdx
    )
    const rv = (row: unknown, i: number) => (row as unknown[])[i]
    const nodeNames = new Set<string>()
    const rawLinks: { source: string; target: string; value: number }[] = []
    for (const row of output.rows) {
      const src = String(rv(row, srcIdx) ?? "")
      const tgt = String(rv(row, tgtIdx) ?? "")
      const val = Number.parseFloat(String(rv(row, Math.max(0, valIdx)) ?? "0"))
      if (src && tgt && Number.isFinite(val) && val > 0) {
        nodeNames.add(src)
        nodeNames.add(tgt)
        rawLinks.push({ source: src, target: tgt, value: val })
      }
    }
    const nodeArray = [...nodeNames]
    return {
      links: rawLinks.map((l) => ({
        source: nodeArray.indexOf(l.source),
        target: nodeArray.indexOf(l.target),
        value: l.value,
      })),
      nodes: nodeArray.map((name) => ({ name })),
    }
  }, [output])

  const queryResult: QueryResponse | null = useMemo(
    () =>
      output.columns && output.rows
        ? {
            columns: output.columns,
            row_count: output.rows.length,
            rows: output.rows,
          }
        : null,
    [output.columns, output.rows]
  )

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconChartBar className="shrink-0 text-muted-foreground" size={12} />
        <span className="flex-1 truncate font-medium">{output.title}</span>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setSqlOpen((v) => !v)}
          title="Toggle SQL"
          type="button"
        >
          <IconChevronDown
            className={cn("transition-transform", sqlOpen && "rotate-180")}
            size={11}
          />
        </button>
      </div>

      {sqlOpen && (
        <pre className="overflow-x-auto whitespace-pre-wrap border-b bg-muted/30 px-3 py-2 font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 font-mono text-destructive">
          {output.error}
        </div>
      )}

      {!output.error && (
        <>
          {/* Tab bar */}
          <div className="flex items-center border-b px-1">
            {(["chart", "data"] as const).map((t) => (
              <button
                className={cn(
                  "-mb-px flex items-center gap-1 border-b-2 px-2 py-1.5 font-medium capitalize transition-colors",
                  tab === t
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                key={t}
                onClick={() => setTab(t)}
                type="button"
              >
                {t === "chart" ? (
                  <IconChartBar size={11} />
                ) : (
                  <IconDatabase size={11} />
                )}
                {t}
              </button>
            ))}
            {queryResult && (
              <>
                <div className="flex-1" />
                <span className="pr-2 text-[11px] text-muted-foreground">
                  {queryResult.row_count}{" "}
                  {queryResult.row_count === 1 ? "row" : "rows"}
                </span>
              </>
            )}
          </div>

          {tab === "chart" &&
            (keys.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                Cannot map &quot;{output.x}&quot; / &quot;{output.y}&quot; to
                chart axes
              </div>
            ) : output.chartType === "pie" ? (
              <div
                className="flex items-center gap-6 px-4"
                style={{ height: 260 }}
              >
                <div className="aspect-square h-full shrink-0">
                  <PieChart
                    cornerRadius={3}
                    data={pieData}
                    innerRadius={55}
                    padAngle={0.02}
                  >
                    {pieData.map((_, i) => (
                      <PieSlice index={i} key={i} />
                    ))}
                  </PieChart>
                </div>
                <div className="flex max-h-full min-w-0 flex-1 flex-col justify-center gap-2 overflow-y-auto">
                  {pieData.map((item, i) => {
                    const pct =
                      pieTotal > 0
                        ? ((item.value / pieTotal) * 100).toFixed(1)
                        : "0.0"
                    return (
                      <div
                        className="flex items-center gap-2 text-[11px]"
                        key={item.label}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{
                            background: VIZ_COLORS[i % VIZ_COLORS.length],
                          }}
                        />
                        <span className="truncate text-foreground/75">
                          {item.label}
                        </span>
                        <span className="ml-auto shrink-0 pl-2 text-muted-foreground tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : output.chartType === "sankey" ? (
              <div style={{ height: 260 }}>
                <SankeyChart
                  animationDuration={600}
                  aspectRatio="auto"
                  className="h-full"
                  data={sankeyData}
                  margin={{ bottom: 16, left: 120, right: 120, top: 16 }}
                >
                  <SankeyNode />
                  <SankeyLink />
                  <SankeyTooltip />
                </SankeyChart>
              </div>
            ) : output.chartType === "line" || output.chartType === "area" ? (
              <div style={{ height: 260 }}>
                <AreaChart
                  animationDuration={600}
                  aspectRatio="auto"
                  className="h-full"
                  data={areaData}
                  margin={{ bottom: 40, left: 48, right: 16, top: 16 }}
                  xDataKey={output.x}
                >
                  <Grid />
                  <Area
                    dataKey={output.y}
                    fillOpacity={output.chartType === "line" ? 0 : 0.4}
                  />
                  <ChartTooltip />
                </AreaChart>
              </div>
            ) : (
              <div style={{ height: 260 }}>
                <BarChart
                  animationDuration={600}
                  aspectRatio="auto"
                  className="h-full"
                  data={barData}
                  margin={{ bottom: 40, left: 48, right: 16, top: 16 }}
                  xDataKey={output.x}
                >
                  <Grid />
                  <Bar dataKey={output.y} />
                  <ChartTooltip showDatePill={false} />
                  <BarXAxis />
                </BarChart>
              </div>
            ))}

          {tab === "data" && queryResult && (
            <ResultsGrid queryResult={queryResult} />
          )}
        </>
      )}

      {output.explanation && (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {output.explanation}
        </p>
      )}
    </div>
  )
}

// ── AccessRequestCard ─────────────────────────────────────────────────────────

function AccessRequestCard({
  output,
  onSendMessage,
}: {
  output: AccessRequestPreviewOutput
  onSendMessage?: (text: string) => void
}) {
  const [rationale, setRationale] = useState(output.rationale)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{
    code: string
    status: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const req = await createPermissionRequest({
        privileges: output.privileges,
        rationale,
        requested_duration_days: output.suggested_duration_days,
        resource: output.resource,
        scope: output.scope,
        submit_as: "personal",
      })
      setSubmitted({ code: req.code, status: req.status })
      onSendMessage?.(`Check my access request status for ${req.code}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconShieldLock className="shrink-0 text-muted-foreground" size={12} />
        <span className="flex-1 font-medium">Request Data Access</span>
        <span className="text-muted-foreground capitalize">{output.scope}</span>
      </div>

      <div className="space-y-2 px-3 py-2">
        <div>
          <div className="mb-0.5 text-muted-foreground">Resource</div>
          <code className="break-all rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
            {output.resource}
          </code>
        </div>

        <div className="flex flex-wrap gap-1">
          {output.privileges.map((p) => (
            <span
              className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]"
              key={p}
            >
              {p}
            </span>
          ))}
        </div>

        {output.explanation && (
          <p className="text-[11px] text-muted-foreground">
            {output.explanation}
          </p>
        )}

        {submitted ? (
          <div className="flex items-center gap-2 py-1 text-emerald-600">
            <IconCheck className="shrink-0" size={13} />
            <span>
              Request submitted —{" "}
              <span className="font-mono font-semibold">{submitted.code}</span>
            </span>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1 text-muted-foreground">Rationale</div>
              <textarea
                className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
                value={rationale}
              />
            </div>
            {error && (
              <div className="text-[11px] text-destructive">{error}</div>
            )}
            <Button
              className="h-7 px-3 text-xs"
              disabled={submitting || !rationale.trim()}
              onClick={handleSubmit}
              size="sm"
            >
              {submitting ? (
                <>
                  <IconLoader2 className="mr-1.5 animate-spin" size={11} />
                  Submitting…
                </>
              ) : (
                "Request Access"
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ── RequestStatusCard ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  approved: "text-emerald-600 bg-emerald-50 border-emerald-200",
  cancelled: "text-muted-foreground bg-muted/30 border-border",
  "needs-info": "text-orange-600 bg-orange-50 border-orange-200",
  pending: "text-amber-600 bg-amber-50 border-amber-200",
  ready: "text-blue-600 bg-blue-50 border-blue-200",
}

function RequestStatusCard({ output }: { output: RequestStatusOutput }) {
  if (output.error) {
    return (
      <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
        {output.error}
      </div>
    )
  }

  const colorClass = STATUS_COLORS[output.status] ?? STATUS_COLORS.pending

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconShieldCheck className="shrink-0 text-muted-foreground" size={12} />
        <span className="flex-1 font-mono font-semibold">{output.code}</span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-medium text-[10px] capitalize",
            colorClass
          )}
        >
          {output.status}
        </span>
      </div>

      <div className="space-y-2 px-3 py-2">
        <div>
          <div className="mb-0.5 text-muted-foreground">Resource</div>
          <code className="break-all rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
            {output.resource}
          </code>
          <span className="ml-1.5 text-muted-foreground capitalize">
            {output.scope}
          </span>
        </div>

        {output.approval_steps?.length > 0 && (
          <div>
            <div className="mb-1.5 text-muted-foreground">Approval steps</div>
            <div className="space-y-1">
              {output.approval_steps.map((step) => (
                <div className="flex items-center gap-2" key={step.id}>
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      step.status === "approved"
                        ? "bg-emerald-500"
                        : step.is_current
                          ? "bg-amber-400"
                          : step.status === "cancelled"
                            ? "bg-muted-foreground/40"
                            : "bg-muted-foreground/20"
                    )}
                  />
                  <span
                    className={cn("flex-1", step.is_current && "font-medium")}
                  >
                    {step.approver_label}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {output.status === "approved" && output.expires_at && (
          <div className="text-[11px] text-muted-foreground">
            Access expires in {output.expires_in_days} day
            {output.expires_in_days === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AccessRequestsListCard ────────────────────────────────────────────────────

const REQUEST_STATUS_COLORS: Record<string, { dot: string; badge: string }> = {
  approved: {
    badge: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  cancelled: {
    badge: "text-muted-foreground bg-muted/30 border-border",
    dot: "bg-muted-foreground/40",
  },
  "needs-info": {
    badge: "text-orange-700 bg-orange-50 border-orange-200",
    dot: "bg-orange-400",
  },
  pending: {
    badge: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-400",
  },
  ready: {
    badge: "text-blue-700 bg-blue-50 border-blue-200",
    dot: "bg-blue-400",
  },
}

function AccessRequestsListCard({
  output,
  onSendMessage,
}: {
  output: ListMyAccessRequestsOutput
  onSendMessage?: (text: string) => void
}) {
  if (output.error) {
    return (
      <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
        {output.error}
      </div>
    )
  }

  if (output.requests.length === 0) {
    return (
      <div className="mt-1 rounded-lg border px-4 py-6 text-center text-muted-foreground text-xs">
        You have no access requests yet.
      </div>
    )
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconShieldCheck className="shrink-0 text-muted-foreground" size={12} />
        <span className="flex-1 font-medium">My Access Requests</span>
        <span className="text-muted-foreground">{output.requests.length}</span>
      </div>

      <div className="divide-y">
        {output.requests.map((req) => {
          const colors =
            REQUEST_STATUS_COLORS[req.status] ?? REQUEST_STATUS_COLORS.pending
          const ago = formatDistanceToNowStrict(new Date(req.submitted_at), {
            addSuffix: true,
          })

          return (
            <button
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
              key={req.id}
              onClick={() =>
                onSendMessage?.(
                  `Tell me about my access request ${req.code} for \`${req.resource}\`.`
                )
              }
              type="button"
            >
              <div
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  colors.dot
                )}
              />

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{req.code}</span>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-px font-medium text-[10px] capitalize",
                      colors.badge
                    )}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="truncate font-mono text-muted-foreground">
                  {req.resource}
                </div>
                {req.rationale && (
                  <div className="line-clamp-1 text-muted-foreground">
                    {req.rationale}
                  </div>
                )}
              </div>

              <div className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">
                {ago}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── ExploreCatalogCard ────────────────────────────────────────────────────────

function CatalogTableList({
  tables,
  catalogs,
  locked,
  requestByFqn,
  onSendMessage,
}: {
  tables: ExploreCatalogTable[]
  catalogs: string[]
  locked?: boolean
  requestByFqn?: Map<string, PermissionRequest>
  onSendMessage?: (text: string) => void
}) {
  const byCatalog = catalogs.map((catalog) => ({
    catalog,
    tables: tables.filter((t) => t.catalog === catalog),
  }))

  return (
    <>
      {byCatalog.map(({ catalog, tables: catalogTables }) => (
        <div key={catalog}>
          <div className="flex items-center gap-2 border-b bg-muted/10 px-3 py-1.5">
            <div
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                locked ? "bg-muted-foreground/40" : "bg-emerald-500"
              )}
            />
            <span
              className={cn(
                "font-mono font-semibold text-[11px]",
                locked && "text-muted-foreground"
              )}
            >
              {catalog}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {catalogTables.length}{" "}
              {catalogTables.length === 1 ? "table" : "tables"}
            </span>
            {locked && (
              <span className="ml-auto rounded bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground">
                no access
              </span>
            )}
          </div>

          <div className="divide-y">
            {catalogTables.map((t) => {
              const descLine = t.description
                .split("\n")
                .find((l) => l.startsWith("Description:"))
              const summary = descLine
                ? descLine.replace(/^Description:\s*/, "")
                : (t.description.split("\n")[1] ?? "")
              const existingRequest = requestByFqn?.get(t.fqn)

              return (
                <div
                  className="flex items-start gap-2.5 px-3 py-2 pl-6"
                  key={t.fqn}
                >
                  <div className={cn("min-w-0 flex-1", locked && "opacity-50")}>
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate font-medium font-mono text-[11px]">
                        {t.table}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {t.schema}
                      </span>
                    </div>
                    {summary && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {summary}
                      </div>
                    )}
                  </div>

                  {!locked && onSendMessage && (
                    <button
                      className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                      onClick={() =>
                        onSendMessage(`SELECT * FROM ${t.fqn} LIMIT 20`)
                      }
                      type="button"
                    >
                      <IconDatabase size={10} />
                      Query
                    </button>
                  )}

                  {locked &&
                    onSendMessage &&
                    (existingRequest ? (
                      <button
                        className="flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 transition-colors hover:bg-blue-100"
                        onClick={() =>
                          onSendMessage(
                            `Check my access request status for ${existingRequest.code}`
                          )
                        }
                        type="button"
                      >
                        <IconShieldCheck size={10} />
                        {existingRequest.code}
                      </button>
                    ) : (
                      <button
                        className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                        onClick={() => {
                          onSendMessage(`I want to request access to ${t.fqn}`)
                        }}
                        type="button"
                      >
                        <IconShieldLock size={10} />
                        Request Access
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

function ExploreCatalogCard({
  output,
  onSendMessage,
}: {
  output: ExploreCatalogOutput
  onSendMessage?: (text: string) => void
}) {
  const [requestByFqn, setRequestByFqn] = useState<
    Map<string, PermissionRequest>
  >(new Map())

  useEffect(() => {
    listPermissionRequests()
      .then((reqs) => {
        setRequestByFqn(new Map(reqs.map((r) => [r.resource, r])))
      })
      .catch(() => {})
  }, [])

  const tables = output.tables ?? []
  const inaccessibleTables = output.inaccessible_tables ?? []
  const inaccessibleCatalogs = output.inaccessible_catalogs ?? []
  const tableCount = tables.length
  const catalogCount = output.catalogs.length
  const hasInaccessible =
    inaccessibleCatalogs.length > 0 || inaccessibleTables.length > 0

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconTriangleSquareCircle
          className="shrink-0 text-muted-foreground"
          size={12}
        />
        <span className="flex-1 font-medium">Catalog Explorer</span>
        {output.search && (
          <span className="font-mono text-[11px] text-muted-foreground">
            &ldquo;{output.search}&rdquo;
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {tableCount} {tableCount === 1 ? "table" : "tables"} · {catalogCount}{" "}
          {catalogCount === 1 ? "catalog" : "catalogs"}
        </span>
      </div>

      {/* Overview */}
      {output.overview && (
        <p className="border-b px-3 py-2 text-[11px] text-muted-foreground">
          {output.overview}
        </p>
      )}

      {/* Empty state */}
      {catalogCount === 0 && !hasInaccessible && (
        <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
          No tables found{output.search ? ` matching "${output.search}"` : ""}.
        </div>
      )}

      {/* Accessible catalogs + tables */}
      {catalogCount > 0 && (
        <CatalogTableList
          catalogs={output.catalogs}
          onSendMessage={onSendMessage}
          tables={tables}
        />
      )}

      {/* Inaccessible section */}
      {hasInaccessible && (
        <>
          <div className="flex items-center gap-2 border-t border-b bg-muted/5 px-3 py-1.5">
            <IconShieldLock
              className="shrink-0 text-muted-foreground"
              size={11}
            />
            <span className="font-medium text-[11px] text-muted-foreground">
              Additional results — access required
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {inaccessibleTables.length}{" "}
              {inaccessibleTables.length === 1 ? "table" : "tables"}
            </span>
          </div>
          <CatalogTableList
            catalogs={inaccessibleCatalogs}
            locked
            onSendMessage={onSendMessage}
            requestByFqn={requestByFqn}
            tables={inaccessibleTables}
          />
        </>
      )}
    </div>
  )
}

// ── ToolPart ──────────────────────────────────────────────────────────────────

function ToolPart({
  part,
  onSendMessage,
}: {
  part: UIMessagePart<UIDataTypes, UITools>
  onSendMessage?: (text: string) => void
}) {
  if (!(part && isToolUIPart(part))) {
    return null
  }

  const name = getToolName(part)

  if (name === "runQuery") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { explanation?: string } | undefined
      return (
        <div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
          <IconLoader2 className="shrink-0 animate-spin" size={12} />
          {input?.explanation ?? "Running query…"}
        </div>
      )
    }
    if (part.state === "output-available") {
      return <QueryResultCard output={part.output as RunQueryOutput} />
    }
    if (part.state === "output-error") {
      return <ToolError text={part.errorText} />
    }
  }

  if (name === "exploreCatalog") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { search?: string } | undefined
      return (
        <div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
          <IconLoader2 className="shrink-0 animate-spin" size={12} />
          <IconSearch className="shrink-0" size={11} />
          {input?.search
            ? `Searching catalog for "${input.search}"…`
            : "Exploring catalog…"}
        </div>
      )
    }
    if (part.state === "output-available") {
      return (
        <ExploreCatalogCard
          onSendMessage={onSendMessage}
          output={part.output as ExploreCatalogOutput}
        />
      )
    }
    if (part.state === "output-error") {
      return <ToolError text={part.errorText} />
    }
  }

  if (name === "listMyAccessRequests") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      return (
        <div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
          <IconLoader2 className="shrink-0 animate-spin" size={12} />
          Loading your access requests…
        </div>
      )
    }
    if (part.state === "output-available") {
      return (
        <AccessRequestsListCard
          onSendMessage={onSendMessage}
          output={part.output as ListMyAccessRequestsOutput}
        />
      )
    }
    if (part.state === "output-error") {
      return <ToolError text={part.errorText} />
    }
  }

  if (name === "prepareAccessRequest") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { resource?: string } | undefined
      return (
        <div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
          <IconLoader2 className="shrink-0 animate-spin" size={12} />
          {input?.resource
            ? `Preparing access request for ${input.resource}…`
            : "Preparing access request…"}
        </div>
      )
    }
    if (part.state === "output-available") {
      return (
        <AccessRequestCard
          onSendMessage={onSendMessage}
          output={part.output as AccessRequestPreviewOutput}
        />
      )
    }
    if (part.state === "output-error") {
      return <ToolError text={part.errorText} />
    }
  }

  if (name === "checkAccessRequestStatus") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      return (
        <div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
          <IconLoader2 className="shrink-0 animate-spin" size={12} />
          Checking request status…
        </div>
      )
    }
    if (part.state === "output-available") {
      return <RequestStatusCard output={part.output as RequestStatusOutput} />
    }
    if (part.state === "output-error") {
      return <ToolError text={part.errorText} />
    }
  }

  if (name === "visualizeChart") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { title?: string } | undefined
      return (
        <div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
          <IconLoader2 className="shrink-0 animate-spin" size={12} />
          {input?.title ? `Charting: ${input.title}` : "Building chart…"}
        </div>
      )
    }
    if (part.state === "output-available") {
      return <VisualizationCard output={part.output as VisualizeChartOutput} />
    }
    if (part.state === "output-error") {
      return <ToolError text={part.errorText} />
    }
  }

  return null
}

function ToolError({ text }: { text: string }) {
  return (
    <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
      {text}
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isAnimating,
  onSendMessage,
}: {
  message: UIMessage
  isAnimating: boolean
  onSendMessage?: (text: string) => void
}) {
  const isUser = message.role === "user"

  if (isUser) {
    const text = message.parts.find((p) => p.type === "text")?.text ?? ""
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[72%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground text-sm">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-1.5 px-4 py-1.5">
      {message.parts.map((part, i) => {
        if (!part) {
          return null
        }
        if (part.type === "text") {
          if (!part.text.trim()) {
            return null
          }
          return (
            <Streamdown
              animated
              className="text-sm leading-relaxed"
              isAnimating={isAnimating}
              key={i}
            >
              {part.text}
            </Streamdown>
          )
        }
        if (isToolUIPart(part)) {
          return <ToolPart key={i} onSendMessage={onSendMessage} part={part} />
        }
        return null
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "HDBank customers by segment and credit score band",
  "Top VietJet activation candidates ranked by propensity score",
  "Travel spend vs cross-sell readiness for HDBank customers",
  "Co-brand audience breakdown by priority band and offer",
  "VietJet customers by membership tier and gross booking value",
  "Baggage damage classifications by label and confidence score",
]

export default function AnalyticsPage() {
  const [input, setInput] = useState("")
  const [modelId, setModelId] = useState<ModelId>("gpt-5.4-nano")
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string>("default")
  const modelIdRef = useRef<ModelId>(modelId)

  useEffect(() => {
    modelIdRef.current = modelId
  }, [modelId])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/analytics/chat",
        body: () => ({
          modelId: modelIdRef.current,
          sessionId: sessionIdRef.current,
        }),
      }),
    []
  )

  const { messages, sendMessage, status } = useChat({ transport })

  const isLoading = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) {
      return
    }
    setInput("")
    await sendMessage({ text })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Message list ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-muted-foreground">
            <IconSparkles className="opacity-15" size={40} />
            <p className="font-medium text-sm">Ask anything about your data</p>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent"
                  key={s}
                  onClick={() => {
                    setInput(s)
                    textareaRef.current?.focus()
                  }}
                  type="button"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-1 py-4">
            {messages.map((msg) => (
              <MessageBubble
                isAnimating={isLoading && msg === messages.at(-1)}
                key={msg.id}
                message={msg}
                onSendMessage={(text) => sendMessage({ text })}
              />
            ))}

            {isLoading && messages.at(-1)?.role === "user" && (
              <div className="flex items-center gap-2 px-4 py-1.5 text-muted-foreground text-sm">
                <IconLoader2 className="animate-spin" size={14} />
                Thinking…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Composer ── */}
      <div className="shrink-0 py-4">
        <div className="mx-auto max-w-3xl px-4">
          <div className="rounded-2xl border bg-background">
            <textarea
              className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
              disabled={isLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data… (Enter to send, Shift+Enter for new line)"
              ref={textareaRef}
              rows={2}
              value={input}
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <Select
                onValueChange={(v) => setModelId(v as ModelId)}
                value={modelId}
              >
                <SelectTrigger className="h-7 w-36 gap-1.5 px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem className="text-xs" key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                className="h-7 px-3 text-xs"
                disabled={isLoading || !input.trim()}
                onClick={handleSend}
                size="sm"
              >
                {isLoading ? (
                  <IconLoader2 className="animate-spin" size={12} />
                ) : (
                  <IconArrowUp size={12} />
                )}
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
