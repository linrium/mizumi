"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai"
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai"
import { Streamdown } from "streamdown"
import { formatDistanceToNowStrict } from "date-fns"
import ReactECharts from "echarts-for-react"
import type { ColumnDef } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Chart01Icon,
  Loading03Icon,
  ArrowDown01Icon,
  DatabaseIcon,
  Shield01Icon,
  Tick02Icon,
  SecurityIcon,
  Search01Icon,
  CatalogueIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataGrid } from "@/components/data-grid/data-grid"
import { useDataGrid } from "@/hooks/use-data-grid"
import { MODELS, type ModelId } from "@/services/ai-models"
import { createPermissionRequest, listPermissionRequests, type PermissionRequest } from "@/services/permissions"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type RunQueryOutput = {
  sql: string
  explanation: string
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  error?: string
}

type VisualizeChartOutput = {
  sql: string
  title: string
  chartType: "bar" | "line" | "area" | "pie" | "scatter"
  x: string
  y: string
  explanation: string
  columns?: string[]
  rows?: unknown[][]
  error?: string
}

type QueryResponse = { columns: string[]; rows: unknown[][]; row_count: number }
type Row = Record<string, unknown>

type AccessRequestPreviewOutput = {
  resource: string
  scope: "catalog" | "schema" | "table"
  privileges: string[]
  rationale: string
  suggested_duration_days: number
  explanation: string
}

type RequestApprovalStep = {
  id: string
  stage_order: number
  approver_label: string
  approver_team: string
  status: string
  is_current: boolean
}

type RequestStatusOutput = {
  id: string
  code: string
  resource: string
  scope: string
  status: string
  submitted_at: string
  expires_at: string
  expires_in_days: number
  approval_steps: RequestApprovalStep[]
  queue_decision: string
  rationale: string
  error?: string
}

type RequestListItem = {
  id: string
  code: string
  resource: string
  scope: string
  status: string
  submitted_at: string
  privileges: string[]
  rationale: string
  expires_in_days: number
  queue_decision: string
}

type ListMyAccessRequestsOutput = {
  requests: RequestListItem[]
  error?: string
}

type ExploreCatalogTable = {
  fqn: string
  catalog: string
  schema: string
  table: string
  description: string
}

type ExploreCatalogOutput = {
  search: string | null
  catalogs: string[]
  tables: ExploreCatalogTable[]
  inaccessible_catalogs: string[]
  inaccessible_tables: ExploreCatalogTable[]
  overview: string
}

// ── ResultsGrid ───────────────────────────────────────────────────────────────

function ResultsGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(220)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setHeight(e[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () =>
      queryResult.rows.map((row) =>
        Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]])),
      ),
    [queryResult],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      queryResult.columns.map((col) => ({
        id: col,
        accessorKey: col,
        header: col,
        size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
        meta: { cell: { variant: "short-text" as const } },
      })),
    [queryResult],
  )

  const { table, ...dataGridProps } = useDataGrid<Row>({
    data,
    columns,
    readOnly: true,
  })

  return (
    <div ref={containerRef} style={{ height: 220 }} className="overflow-hidden">
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
          rows: output.rows,
          row_count: output.row_count ?? output.rows.length,
        }
      : null

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      <button
        type="button"
        onClick={() => setSqlOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:bg-accent/40 transition-colors border-b"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={11}
          className={cn(
            "shrink-0 transition-transform",
            sqlOpen && "rotate-180",
          )}
        />
        <HugeiconsIcon icon={DatabaseIcon} size={11} className="shrink-0" />
        <span className="font-mono truncate flex-1 text-left">
          {output.sql.slice(0, 72)}
          {output.sql.length > 72 ? "…" : ""}
        </span>
        {queryResult && (
          <span className="text-muted-foreground text-[11px] shrink-0">
            {queryResult.row_count}{" "}
            {queryResult.row_count === 1 ? "row" : "rows"}
          </span>
        )}
      </button>

      {sqlOpen && (
        <pre className="px-3 py-2 bg-muted/30 whitespace-pre-wrap overflow-x-auto border-b font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 text-destructive font-mono">
          {output.error}
        </div>
      )}

      {queryResult && <ResultsGrid queryResult={queryResult} />}
    </div>
  )
}

// ── VisualizationCard ─────────────────────────────────────────────────────────

function buildEChartsOption(
  chartType: "bar" | "line" | "area" | "pie" | "scatter",
  keys: string[],
  values: number[],
  title: string,
) {
  if (chartType === "pie") {
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { orient: "vertical", left: "left", textStyle: { fontSize: 11 } },
      series: [
        {
          name: title,
          type: "pie",
          radius: ["35%", "65%"],
          data: keys.map((k, i) => ({ name: k, value: values[i] })),
          label: { fontSize: 11 },
        },
      ],
    }
  }
  if (chartType === "scatter") {
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 16, top: 16, bottom: 40, containLabel: false },
      xAxis: {
        type: "category",
        data: keys,
        axisLabel: { fontSize: 11, rotate: keys.length > 6 ? 30 : 0 },
      },
      yAxis: { type: "value", axisLabel: { fontSize: 11 } },
      series: [{ data: values, type: "scatter", symbolSize: 10 }],
    }
  }
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 16, top: 16, bottom: 40, containLabel: false },
    xAxis: {
      type: "category",
      data: keys,
      axisLabel: { fontSize: 11, rotate: keys.length > 6 ? 30 : 0 },
    },
    yAxis: { type: "value", axisLabel: { fontSize: 11 } },
    series: [
      {
        data: values,
        type: chartType === "area" ? "line" : chartType,
        smooth: chartType === "line" || chartType === "area",
        areaStyle: chartType === "area" ? { opacity: 0.18 } : undefined,
      },
    ],
  }
}

function VisualizationCard({ output }: { output: VisualizeChartOutput }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const [tab, setTab] = useState<"chart" | "data">("chart")

  const { keys, values } = useMemo(() => {
    if (!output.columns || !output.rows) return { keys: [], values: [] }
    const xi = output.columns.indexOf(output.x)
    const yi = output.columns.indexOf(output.y)
    if (xi === -1 || yi === -1) return { keys: [], values: [] }
    const pairs = output.rows
      .map((r) => ({
        k: String(r[xi] ?? ""),
        v: parseFloat(String(r[yi] ?? "")),
      }))
      .filter((d) => isFinite(d.v))
    return { keys: pairs.map((d) => d.k), values: pairs.map((d) => d.v) }
  }, [output])

  const option = useMemo(
    () => buildEChartsOption(output.chartType, keys, values, output.title),
    [output.chartType, output.title, keys, values],
  )

  const queryResult: QueryResponse | null = useMemo(
    () =>
      output.columns && output.rows
        ? {
            columns: output.columns,
            rows: output.rows,
            row_count: output.rows.length,
          }
        : null,
    [output.columns, output.rows],
  )

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <HugeiconsIcon
          icon={Chart01Icon}
          size={12}
          className="text-muted-foreground shrink-0"
        />
        <span className="font-medium flex-1 truncate">{output.title}</span>
        <button
          type="button"
          onClick={() => setSqlOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Toggle SQL"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={11}
            className={cn("transition-transform", sqlOpen && "rotate-180")}
          />
        </button>
      </div>

      {sqlOpen && (
        <pre className="px-3 py-2 bg-muted/30 whitespace-pre-wrap overflow-x-auto border-b font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 text-destructive font-mono">
          {output.error}
        </div>
      )}

      {!output.error && (
        <>
          {/* Tab bar */}
          <div className="flex items-center border-b px-1">
            {(["chart", "data"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 font-medium border-b-2 -mb-px capitalize transition-colors",
                  tab === t
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={t === "chart" ? Chart01Icon : DatabaseIcon}
                  size={11}
                />
                {t}
              </button>
            ))}
            {queryResult && (
              <>
                <div className="flex-1" />
                <span className="pr-2 text-muted-foreground text-[11px]">
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
            ) : (
              <ReactECharts
                option={option}
                style={{ height: 260 }}
                opts={{ renderer: "svg" }}
              />
            ))}

          {tab === "data" && queryResult && (
            <ResultsGrid queryResult={queryResult} />
          )}
        </>
      )}

      {output.explanation && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">
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
  const [submitted, setSubmitted] = useState<{ code: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const req = await createPermissionRequest({
        submit_as: "personal",
        resource: output.resource,
        scope: output.scope,
        privileges: output.privileges,
        rationale,
        requested_duration_days: output.suggested_duration_days,
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
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <HugeiconsIcon icon={Shield01Icon} size={12} className="text-muted-foreground shrink-0" />
        <span className="font-medium flex-1">Request Data Access</span>
        <span className="text-muted-foreground capitalize">{output.scope}</span>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div>
          <div className="text-muted-foreground mb-0.5">Resource</div>
          <code className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded break-all">
            {output.resource}
          </code>
        </div>

        <div className="flex flex-wrap gap-1">
          {output.privileges.map((p) => (
            <span key={p} className="px-1.5 py-0.5 rounded bg-muted/60 font-mono text-[10px]">
              {p}
            </span>
          ))}
        </div>

        {output.explanation && (
          <p className="text-muted-foreground text-[11px]">{output.explanation}</p>
        )}

        {submitted ? (
          <div className="flex items-center gap-2 py-1 text-emerald-600">
            <HugeiconsIcon icon={Tick02Icon} size={13} className="shrink-0" />
            <span>
              Request submitted — <span className="font-mono font-semibold">{submitted.code}</span>
            </span>
          </div>
        ) : (
          <>
            <div>
              <div className="text-muted-foreground mb-1">Rationale</div>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
                className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {error && <div className="text-destructive text-[11px]">{error}</div>}
            <Button
              size="sm"
              disabled={submitting || !rationale.trim()}
              onClick={handleSubmit}
              className="h-7 px-3 text-xs"
            >
              {submitting ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin mr-1.5" />
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
  pending: "text-amber-600 bg-amber-50 border-amber-200",
  "needs-info": "text-orange-600 bg-orange-50 border-orange-200",
  approved: "text-emerald-600 bg-emerald-50 border-emerald-200",
  cancelled: "text-muted-foreground bg-muted/30 border-border",
  ready: "text-blue-600 bg-blue-50 border-blue-200",
}

function RequestStatusCard({ output }: { output: RequestStatusOutput }) {
  if (output.error) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-1">
        {output.error}
      </div>
    )
  }

  const colorClass = STATUS_COLORS[output.status] ?? STATUS_COLORS.pending

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <HugeiconsIcon icon={SecurityIcon} size={12} className="text-muted-foreground shrink-0" />
        <span className="font-mono font-semibold flex-1">{output.code}</span>
        <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-medium capitalize", colorClass)}>
          {output.status}
        </span>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div>
          <div className="text-muted-foreground mb-0.5">Resource</div>
          <code className="font-mono text-[11px] bg-muted/40 px-1.5 py-0.5 rounded break-all">
            {output.resource}
          </code>
          <span className="ml-1.5 text-muted-foreground capitalize">{output.scope}</span>
        </div>

        {output.approval_steps?.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1.5">Approval steps</div>
            <div className="space-y-1">
              {output.approval_steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      step.status === "approved"
                        ? "bg-emerald-500"
                        : step.is_current
                          ? "bg-amber-400"
                          : step.status === "cancelled"
                            ? "bg-muted-foreground/40"
                            : "bg-muted-foreground/20",
                    )}
                  />
                  <span className={cn("flex-1", step.is_current && "font-medium")}>
                    {step.approver_label}
                  </span>
                  <span className="text-muted-foreground capitalize text-[10px]">{step.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {output.status === "approved" && output.expires_at && (
          <div className="text-muted-foreground text-[11px]">
            Access expires in {output.expires_in_days} day{output.expires_in_days === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AccessRequestsListCard ────────────────────────────────────────────────────

const REQUEST_STATUS_COLORS: Record<string, { dot: string; badge: string }> = {
  pending:      { dot: "bg-amber-400",          badge: "text-amber-700 bg-amber-50 border-amber-200" },
  "needs-info": { dot: "bg-orange-400",          badge: "text-orange-700 bg-orange-50 border-orange-200" },
  approved:     { dot: "bg-emerald-500",         badge: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  cancelled:    { dot: "bg-muted-foreground/40", badge: "text-muted-foreground bg-muted/30 border-border" },
  ready:        { dot: "bg-blue-400",            badge: "text-blue-700 bg-blue-50 border-blue-200" },
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
      <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-1">
        {output.error}
      </div>
    )
  }

  if (output.requests.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-6 text-xs text-muted-foreground text-center mt-1">
        You have no access requests yet.
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <HugeiconsIcon icon={SecurityIcon} size={12} className="text-muted-foreground shrink-0" />
        <span className="font-medium flex-1">My Access Requests</span>
        <span className="text-muted-foreground">{output.requests.length}</span>
      </div>

      <div className="divide-y">
        {output.requests.map((req) => {
          const colors = REQUEST_STATUS_COLORS[req.status] ?? REQUEST_STATUS_COLORS.pending
          const ago = formatDistanceToNowStrict(new Date(req.submitted_at), { addSuffix: true })

          return (
            <button
              key={req.id}
              type="button"
              onClick={() =>
                onSendMessage?.(
                  `Tell me about my access request ${req.code} for \`${req.resource}\`.`,
                )
              }
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors text-left"
            >
              <div className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", colors.dot)} />

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{req.code}</span>
                  <span
                    className={cn(
                      "px-1.5 py-px rounded border text-[10px] font-medium capitalize",
                      colors.badge,
                    )}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="font-mono text-muted-foreground truncate">{req.resource}</div>
                {req.rationale && (
                  <div className="text-muted-foreground line-clamp-1">{req.rationale}</div>
                )}
              </div>

              <div className="shrink-0 text-muted-foreground text-[10px] pt-0.5">{ago}</div>
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
          <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/10 border-b">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                locked ? "bg-muted-foreground/40" : "bg-emerald-500",
              )}
            />
            <span
              className={cn(
                "font-mono font-semibold text-[11px]",
                locked && "text-muted-foreground",
              )}
            >
              {catalog}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {catalogTables.length} {catalogTables.length === 1 ? "table" : "tables"}
            </span>
            {locked && (
              <span className="ml-auto text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-px rounded">
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
                : t.description.split("\n")[1] ?? ""
              const existingRequest = requestByFqn?.get(t.fqn)

              return (
                <div
                  key={t.fqn}
                  className="px-3 py-2 flex items-start gap-2.5 pl-6"
                >
                  <div className={cn("flex-1 min-w-0", locked && "opacity-50")}>
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="font-mono text-[11px] font-medium truncate">{t.table}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0 font-mono">
                        {t.schema}
                      </span>
                    </div>
                    {summary && (
                      <div className="text-muted-foreground text-[11px] mt-0.5 line-clamp-2">
                        {summary}
                      </div>
                    )}
                  </div>

                  {!locked && onSendMessage && (
                    <button
                      type="button"
                      onClick={() =>
                        onSendMessage(`SELECT * FROM ${t.fqn} LIMIT 20`)
                      }
                      className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    >
                      <HugeiconsIcon icon={DatabaseIcon} size={10} />
                      Query
                    </button>
                  )}

                  {locked && onSendMessage && (
                    existingRequest ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSendMessage(`Check my access request status for ${existingRequest.code}`)
                        }
                        className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <HugeiconsIcon icon={SecurityIcon} size={10} />
                        {existingRequest.code}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSendMessage(`I want to request access to ${t.fqn}`)
                        }}
                        className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                      >
                        <HugeiconsIcon icon={Shield01Icon} size={10} />
                        Request Access
                      </button>
                    )
                  )}
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
  const [requestByFqn, setRequestByFqn] = useState<Map<string, PermissionRequest>>(new Map())

  useEffect(() => {
    listPermissionRequests().then((reqs) => {
      setRequestByFqn(new Map(reqs.map((r) => [r.resource, r])))
    }).catch(() => {})
  }, [])

  const tables = output.tables ?? []
  const inaccessibleTables = output.inaccessible_tables ?? []
  const inaccessibleCatalogs = output.inaccessible_catalogs ?? []
  const tableCount = tables.length
  const catalogCount = output.catalogs.length
  const hasInaccessible = inaccessibleCatalogs.length > 0 || inaccessibleTables.length > 0


  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <HugeiconsIcon icon={CatalogueIcon} size={12} className="text-muted-foreground shrink-0" />
        <span className="font-medium flex-1">Catalog Explorer</span>
        {output.search && (
          <span className="text-muted-foreground text-[11px] font-mono">
            &ldquo;{output.search}&rdquo;
          </span>
        )}
        <span className="text-muted-foreground text-[11px]">
          {tableCount} {tableCount === 1 ? "table" : "tables"} · {catalogCount}{" "}
          {catalogCount === 1 ? "catalog" : "catalogs"}
        </span>
      </div>

      {/* Overview */}
      {output.overview && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-b">{output.overview}</p>
      )}

      {/* Empty state */}
      {catalogCount === 0 && !hasInaccessible && (
        <div className="px-3 py-6 text-center text-muted-foreground text-[11px]">
          No tables found{output.search ? ` matching "${output.search}"` : ""}.
        </div>
      )}

      {/* Accessible catalogs + tables */}
      {catalogCount > 0 && (
        <CatalogTableList
          tables={tables}
          catalogs={output.catalogs}
          onSendMessage={onSendMessage}
        />
      )}

      {/* Inaccessible section */}
      {hasInaccessible && (
        <>
          <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/5 border-t border-b">
            <HugeiconsIcon icon={Shield01Icon} size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground font-medium">
              Additional results — access required
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {inaccessibleTables.length} {inaccessibleTables.length === 1 ? "table" : "tables"}
            </span>
          </div>
          <CatalogTableList
            tables={inaccessibleTables}
            catalogs={inaccessibleCatalogs}
            locked
            requestByFqn={requestByFqn}
            onSendMessage={onSendMessage}
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
  if (!part || !isToolUIPart(part)) return null

  const name = getToolName(part)

  if (name === "runQuery") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { explanation?: string } | undefined
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={12}
            className="animate-spin shrink-0"
          />
          {input?.explanation ?? "Running query…"}
        </div>
      )
    }
    if (part.state === "output-available")
      return <QueryResultCard output={part.output as RunQueryOutput} />
    if (part.state === "output-error")
      return <ToolError text={part.errorText} />
  }

  if (name === "exploreCatalog") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { search?: string } | undefined
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
          <HugeiconsIcon icon={Search01Icon} size={11} className="shrink-0" />
          {input?.search ? `Searching catalog for "${input.search}"…` : "Exploring catalog…"}
        </div>
      )
    }
    if (part.state === "output-available")
      return (
        <ExploreCatalogCard
          output={part.output as ExploreCatalogOutput}
          onSendMessage={onSendMessage}
        />
      )
    if (part.state === "output-error") return <ToolError text={part.errorText} />
  }

  if (name === "listMyAccessRequests") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
          Loading your access requests…
        </div>
      )
    }
    if (part.state === "output-available")
      return (
        <AccessRequestsListCard
          output={part.output as ListMyAccessRequestsOutput}
          onSendMessage={onSendMessage}
        />
      )
    if (part.state === "output-error")
      return <ToolError text={part.errorText} />
  }

  if (name === "prepareAccessRequest") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { resource?: string } | undefined
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
          {input?.resource ? `Preparing access request for ${input.resource}…` : "Preparing access request…"}
        </div>
      )
    }
    if (part.state === "output-available")
      return <AccessRequestCard output={part.output as AccessRequestPreviewOutput} onSendMessage={onSendMessage} />
    if (part.state === "output-error")
      return <ToolError text={part.errorText} />
  }

  if (name === "checkAccessRequestStatus") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
          Checking request status…
        </div>
      )
    }
    if (part.state === "output-available")
      return <RequestStatusCard output={part.output as RequestStatusOutput} />
    if (part.state === "output-error")
      return <ToolError text={part.errorText} />
  }

  if (name === "visualizeChart") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { title?: string } | undefined
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={12}
            className="animate-spin shrink-0"
          />
          {input?.title ? `Charting: ${input.title}` : "Building chart…"}
        </div>
      )
    }
    if (part.state === "output-available")
      return <VisualizationCard output={part.output as VisualizeChartOutput} />
    if (part.state === "output-error")
      return <ToolError text={part.errorText} />
  }

  return null
}

function ToolError({ text }: { text: string }) {
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-1">
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
        <div className="max-w-[72%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-1.5 space-y-1.5 max-w-3xl">
      {message.parts.map((part, i) => {
        if (!part) return null
        if (part.type === "text") {
          if (!part.text.trim()) return null
          return (
            <Streamdown
              key={i}
              animated
              isAnimating={isAnimating}
              className="text-sm leading-relaxed"
            >
              {part.text}
            </Streamdown>
          )
        }
        if (isToolUIPart(part)) return <ToolPart key={i} part={part} onSendMessage={onSendMessage} />
        return null
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "HDBank customer count by segment",
  "Top VietJet activation candidates by propensity score",
  "Travel spend vs credit score across HDBank customers",
  "Co-brand campaign audience by priority band",
  "Campaign summary: customer count and avg propensity by offer",
  "VietJet customers by membership tier and booking value",
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
          sessionId: sessionIdRef.current,
          modelId: modelIdRef.current,
        }),
      }),
    [],
  )

  const { messages, sendMessage, status } = useChat({ transport })

  const isLoading = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Message list ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground px-6">
            <HugeiconsIcon
              icon={Chart01Icon}
              size={40}
              className="opacity-15"
            />
            <p className="text-sm font-medium">Ask anything about your data</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s)
                    textareaRef.current?.focus()
                  }}
                  className="px-3 py-1 text-xs rounded-full border hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-1 max-w-3xl mx-auto w-full">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isAnimating={isLoading && msg === messages.at(-1)}
                onSendMessage={(text) => sendMessage({ text })}
              />
            ))}

            {isLoading && messages.at(-1)?.role === "user" && (
              <div className="flex items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
                Thinking…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Composer ── */}
      <div className="shrink-0 py-4">
        <div className="max-w-3xl mx-auto px-4">
          <div className="rounded-2xl border bg-background">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data… (Enter to send, Shift+Enter for new line)"
              rows={2}
              disabled={isLoading}
              className="w-full resize-none text-sm bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50 px-4 pt-3 pb-2"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <Select
                value={modelId}
                onValueChange={(v) => setModelId(v as ModelId)}
              >
                <SelectTrigger className="h-7 w-36 text-xs px-2 gap-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                disabled={isLoading || !input.trim()}
                onClick={handleSend}
                className="h-7 px-3 text-xs"
              >
                {isLoading ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={12}
                      className="animate-spin mr-1.5"
                    />
                    Running
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
