"use client"

import { useChat } from "@ai-sdk/react"
import {
  IconArrowUp,
  IconBook2,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconDatabase,
  IconLoader2,
  IconMessageCircle,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import { formatDistanceToNowStrict } from "date-fns"
import ReactECharts from "echarts-for-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Streamdown } from "streamdown"
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
  type ChatThreadSummary,
  createChatThread,
  deleteChatThread,
  getChatThread,
  listChatThreads,
  updateChatThread,
} from "@/services/chat-threads"
import {
  createPermissionRequest,
  listPermissionRequests,
  type PermissionRequest,
} from "@/services/permissions"

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

const SUGGESTIONS = [
  "HDBank customer count by segment",
  "Top VietJet activation candidates by propensity score",
  "Travel spend vs credit score across HDBank customers",
  "Co-brand campaign audience by priority band",
  "Campaign summary: customer count and avg propensity by offer",
  "VietJet customers by membership tier and booking value",
]

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50 border-amber-200",
  "needs-info": "text-orange-600 bg-orange-50 border-orange-200",
  approved: "text-emerald-600 bg-emerald-50 border-emerald-200",
  cancelled: "text-muted-foreground bg-muted/30 border-border",
  ready: "text-blue-600 bg-blue-50 border-blue-200",
}

const REQUEST_STATUS_COLORS: Record<string, { dot: string; badge: string }> = {
  pending: {
    dot: "bg-amber-400",
    badge: "text-amber-700 bg-amber-50 border-amber-200",
  },
  "needs-info": {
    dot: "bg-orange-400",
    badge: "text-orange-700 bg-orange-50 border-orange-200",
  },
  approved: {
    dot: "bg-emerald-500",
    badge: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  cancelled: {
    dot: "bg-muted-foreground/40",
    badge: "text-muted-foreground bg-muted/30 border-border",
  },
  ready: {
    dot: "bg-blue-400",
    badge: "text-blue-700 bg-blue-50 border-blue-200",
  },
}

function ResultsGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(220)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height),
    )
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
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <button
        type="button"
        onClick={() => setSqlOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent/40"
      >
        <IconChevronDown
          size={11}
          className={cn(
            "shrink-0 transition-transform",
            sqlOpen && "rotate-180",
          )}
        />
        <IconDatabase size={11} className="shrink-0" />
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
        <pre className="overflow-x-auto border-b bg-muted/30 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
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

function buildEChartsOption(
  chartType: "bar" | "line" | "area" | "pie" | "scatter",
  keys: string[],
  values: number[],
  title: string,
) {
  if (chartType === "pie") {
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: {
        orient: "vertical",
        left: "left",
        textStyle: { fontSize: 11 },
      },
      series: [
        {
          name: title,
          type: "pie",
          radius: ["35%", "65%"],
          data: keys.map((key, index) => ({ name: key, value: values[index] })),
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
      .map((row) => ({
        k: String(row[xi] ?? ""),
        v: parseFloat(String(row[yi] ?? "")),
      }))
      .filter((entry) => Number.isFinite(entry.v))
    return {
      keys: pairs.map((entry) => entry.k),
      values: pairs.map((entry) => entry.v),
    }
  }, [output])

  const option = useMemo(
    () => buildEChartsOption(output.chartType, keys, values, output.title),
    [keys, output.chartType, output.title, values],
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
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconChartBar size={12} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-medium">{output.title}</span>
        <button
          type="button"
          onClick={() => setSqlOpen((value) => !value)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title="Toggle SQL"
        >
          <IconChevronDown
            size={11}
            className={cn("transition-transform", sqlOpen && "rotate-180")}
          />
        </button>
      </div>

      {sqlOpen && (
        <pre className="overflow-x-auto border-b bg-muted/30 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
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
          <div className="flex items-center border-b px-1">
            {(["chart", "data"] as const).map((nextTab) => (
              <button
                key={nextTab}
                type="button"
                onClick={() => setTab(nextTab)}
                className={cn(
                  "mb-px flex items-center gap-1 border-b-2 px-2 py-1.5 font-medium capitalize transition-colors",
                  tab === nextTab
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {nextTab === "chart" ? (
                  <IconChartBar size={11} />
                ) : (
                  <IconDatabase size={11} />
                )}
                {nextTab}
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
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {output.explanation}
        </p>
      )}
    </div>
  )
}

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
      const request = await createPermissionRequest({
        submit_as: "personal",
        resource: output.resource,
        scope: output.scope,
        privileges: output.privileges,
        rationale,
        requested_duration_days: output.suggested_duration_days,
      })
      setSubmitted({ code: request.code, status: request.status })
      onSendMessage?.(`Check my access request status for ${request.code}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconShieldLock size={12} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium">Request Data Access</span>
        <span className="capitalize text-muted-foreground">{output.scope}</span>
      </div>

      <div className="space-y-2 px-3 py-2">
        <div>
          <div className="mb-0.5 text-muted-foreground">Resource</div>
          <code className="break-all rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
            {output.resource}
          </code>
        </div>

        <div className="flex flex-wrap gap-1">
          {output.privileges.map((privilege) => (
            <span
              key={privilege}
              className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]"
            >
              {privilege}
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
            <IconCheck size={13} className="shrink-0" />
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
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {error && (
              <div className="text-[11px] text-destructive">{error}</div>
            )}
            <Button
              size="sm"
              disabled={submitting || !rationale.trim()}
              onClick={handleSubmit}
              className="h-7 px-3 text-xs"
            >
              {submitting ? (
                <>
                  <IconLoader2 size={11} className="mr-1.5 animate-spin" />
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

function RequestStatusCard({ output }: { output: RequestStatusOutput }) {
  if (output.error) {
    return (
      <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {output.error}
      </div>
    )
  }

  const colorClass = STATUS_COLORS[output.status] ?? STATUS_COLORS.pending

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconShieldCheck size={12} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 font-mono font-semibold">{output.code}</span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize",
            colorClass,
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
          <span className="ml-1.5 capitalize text-muted-foreground">
            {output.scope}
          </span>
        </div>

        {output.approval_steps?.length > 0 && (
          <div>
            <div className="mb-1.5 text-muted-foreground">Approval steps</div>
            <div className="space-y-1">
              {output.approval_steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      step.status === "approved"
                        ? "bg-emerald-500"
                        : step.is_current
                          ? "bg-amber-400"
                          : step.status === "cancelled"
                            ? "bg-muted-foreground/40"
                            : "bg-muted-foreground/20",
                    )}
                  />
                  <span
                    className={cn("flex-1", step.is_current && "font-medium")}
                  >
                    {step.approver_label}
                  </span>
                  <span className="text-[10px] capitalize text-muted-foreground">
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

function AccessRequestsListCard({
  output,
  onSendMessage,
}: {
  output: ListMyAccessRequestsOutput
  onSendMessage?: (text: string) => void
}) {
  if (output.error) {
    return (
      <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {output.error}
      </div>
    )
  }

  if (output.requests.length === 0) {
    return (
      <div className="mt-1 rounded-lg border px-4 py-6 text-center text-xs text-muted-foreground">
        You have no access requests yet.
      </div>
    )
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border text-xs">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconShieldCheck size={12} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium">My Access Requests</span>
        <span className="text-muted-foreground">{output.requests.length}</span>
      </div>

      <div className="divide-y">
        {output.requests.map((request) => {
          const colors =
            REQUEST_STATUS_COLORS[request.status] ??
            REQUEST_STATUS_COLORS.pending
          const ago = formatDistanceToNowStrict(
            new Date(request.submitted_at),
            {
              addSuffix: true,
            },
          )

          return (
            <button
              key={request.id}
              type="button"
              onClick={() =>
                onSendMessage?.(
                  `Tell me about my access request ${request.code} for \`${request.resource}\`.`,
                )
              }
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
            >
              <div
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  colors.dot,
                )}
              />

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">
                    {request.code}
                  </span>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-px text-[10px] font-medium capitalize",
                      colors.badge,
                    )}
                  >
                    {request.status}
                  </span>
                </div>
                <div className="truncate font-mono text-muted-foreground">
                  {request.resource}
                </div>
                {request.rationale && (
                  <div className="line-clamp-1 text-muted-foreground">
                    {request.rationale}
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
    tables: tables.filter((table) => table.catalog === catalog),
  }))

  return (
    <>
      {byCatalog.map(({ catalog, tables: catalogTables }) => (
        <div key={catalog}>
          <div className="flex items-center gap-2 border-b bg-muted/10 px-3 py-1.5">
            <div
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                locked ? "bg-muted-foreground/40" : "bg-emerald-500",
              )}
            />
            <span
              className={cn(
                "font-mono text-[11px] font-semibold",
                locked && "text-muted-foreground",
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
            {catalogTables.map((table) => {
              const descLine = table.description
                .split("\n")
                .find((line) => line.startsWith("Description:"))
              const summary = descLine
                ? descLine.replace(/^Description:\s*/, "")
                : (table.description.split("\n")[1] ?? "")
              const existingRequest = requestByFqn?.get(table.fqn)

              return (
                <div
                  key={table.fqn}
                  className="flex items-start gap-2.5 px-3 py-2 pl-6"
                >
                  <div className={cn("min-w-0 flex-1", locked && "opacity-50")}>
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate font-mono text-[11px] font-medium">
                        {table.table}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {table.schema}
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
                      type="button"
                      onClick={() =>
                        onSendMessage(`SELECT * FROM ${table.fqn} LIMIT 20`)
                      }
                      className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                    >
                      <IconDatabase size={10} />
                      Query
                    </button>
                  )}

                  {locked &&
                    onSendMessage &&
                    (existingRequest ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSendMessage(
                            `Check my access request status for ${existingRequest.code}`,
                          )
                        }
                        className="flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 transition-colors hover:bg-blue-100"
                      >
                        <IconShieldCheck size={10} />
                        {existingRequest.code}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onSendMessage(
                            `I want to request access to ${table.fqn}`,
                          )
                        }
                        className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
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
      .then((requests) => {
        setRequestByFqn(
          new Map(requests.map((request) => [request.resource, request])),
        )
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
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <IconBook2 size={12} className="shrink-0 text-muted-foreground" />
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

      {output.overview && (
        <p className="border-b px-3 py-2 text-[11px] text-muted-foreground">
          {output.overview}
        </p>
      )}

      {catalogCount === 0 && !hasInaccessible && (
        <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
          No tables found{output.search ? ` matching "${output.search}"` : ""}.
        </div>
      )}

      {catalogCount > 0 && (
        <CatalogTableList
          tables={tables}
          catalogs={output.catalogs}
          onSendMessage={onSendMessage}
        />
      )}

      {hasInaccessible && (
        <>
          <div className="flex items-center gap-2 border-y bg-muted/5 px-3 py-1.5">
            <IconShieldLock
              size={11}
              className="shrink-0 text-muted-foreground"
            />
            <span className="text-[11px] font-medium text-muted-foreground">
              Additional results — access required
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {inaccessibleTables.length}{" "}
              {inaccessibleTables.length === 1 ? "table" : "tables"}
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

function ToolPart({
  part,
  onSendMessage,
}: {
  part: UIMessagePart<UIDataTypes, UITools>
  onSendMessage?: (text: string) => void
}) {
  if (!isToolUIPart(part)) return null

  const name = getToolName(part)

  if (name === "runQuery") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      const input = part.input as { explanation?: string } | undefined
      return (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <IconLoader2 size={12} className="shrink-0 animate-spin" />
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
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <IconLoader2 size={12} className="shrink-0 animate-spin" />
          <IconSearch size={11} className="shrink-0" />
          {input?.search
            ? `Searching catalog for "${input.search}"…`
            : "Exploring catalog…"}
        </div>
      )
    }
    if (part.state === "output-available") {
      return (
        <ExploreCatalogCard
          output={part.output as ExploreCatalogOutput}
          onSendMessage={onSendMessage}
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
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <IconLoader2 size={12} className="shrink-0 animate-spin" />
          Loading your access requests…
        </div>
      )
    }
    if (part.state === "output-available") {
      return (
        <AccessRequestsListCard
          output={part.output as ListMyAccessRequestsOutput}
          onSendMessage={onSendMessage}
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
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <IconLoader2 size={12} className="shrink-0 animate-spin" />
          {input?.resource
            ? `Preparing access request for ${input.resource}…`
            : "Preparing access request…"}
        </div>
      )
    }
    if (part.state === "output-available") {
      return (
        <AccessRequestCard
          output={part.output as AccessRequestPreviewOutput}
          onSendMessage={onSendMessage}
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
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <IconLoader2 size={12} className="shrink-0 animate-spin" />
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
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <IconLoader2 size={12} className="shrink-0 animate-spin" />
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
    <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {text}
    </div>
  )
}

function MessageBubble({
  message,
  isAnimating,
  onSendMessage,
}: {
  message: UIMessage
  isAnimating: boolean
  onSendMessage?: (text: string) => void
}) {
  if (message.role === "user") {
    const text = message.parts.find((part) => part.type === "text")?.text ?? ""
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[72%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-1.5 px-4 py-1.5">
      {message.parts.map((part) => {
        if (part.type === "text") {
          if (!part.text.trim()) return null
          return (
            <Streamdown
              key={`${message.id}-text-${part.text}`}
              animated
              isAnimating={isAnimating}
              className="text-sm leading-relaxed"
            >
              {part.text}
            </Streamdown>
          )
        }
        if (isToolUIPart(part)) {
          return (
            <ToolPart
              key={part.toolCallId}
              part={part}
              onSendMessage={onSendMessage}
            />
          )
        }
        return null
      })}
    </div>
  )
}

function sortThreads(threads: ChatThreadSummary[]) {
  return [...threads].sort((a, b) => {
    const aTime = Date.parse(a.last_message_at ?? a.updated_at)
    const bTime = Date.parse(b.last_message_at ?? b.updated_at)
    return bTime - aTime
  })
}

function upsertThreadSummary(
  threads: ChatThreadSummary[],
  thread: ChatThreadSummary,
) {
  return sortThreads([
    thread,
    ...threads.filter((entry) => entry.id !== thread.id),
  ])
}

function threadTimestamp(thread: ChatThreadSummary) {
  const raw = thread.last_message_at ?? thread.updated_at ?? thread.created_at
  return formatDistanceToNowStrict(new Date(raw), { addSuffix: true })
}

export function AnalyticsChatPage({ threadId }: { threadId?: string }) {
  const router = useRouter()
  const routeThreadId = threadId ?? null
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    routeThreadId,
  )
  const [input, setInput] = useState("")
  const [modelId, setModelId] = useState<ModelId>("gpt-5.4-nano")
  const [threads, setThreads] = useState<ChatThreadSummary[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadsError, setThreadsError] = useState<string | null>(null)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [creatingThread, setCreatingThread] = useState(false)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string>("default")
  const modelIdRef = useRef<ModelId>(modelId)
  const skipThreadLoadRef = useRef<string | null>(null)
  const lastPersistedMessagesRef = useRef("[]")

  useEffect(() => {
    setActiveThreadId(routeThreadId)
  }, [routeThreadId])

  useEffect(() => {
    modelIdRef.current = modelId
  }, [modelId])

  useEffect(() => {
    sessionIdRef.current = activeThreadId ?? "default"
  }, [activeThreadId])

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

  const { messages, sendMessage, setMessages, status } = useChat({
    id: activeThreadId ?? "analytics-draft",
    transport,
    messages: [],
  })

  const isLoading = status === "submitted" || status === "streaming"
  const isBusy = isLoading || creatingThread

  useEffect(() => {
    void listChatThreads()
      .then((items) => {
        setThreads(sortThreads(items))
        setThreadsError(null)
      })
      .catch((err) => {
        setThreadsError((err as Error).message)
      })
      .finally(() => {
        setThreadsLoading(false)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setThreadError(null)

    if (!activeThreadId) {
      setMessages([])
      lastPersistedMessagesRef.current = "[]"
      setThreadLoading(false)
      return () => {
        cancelled = true
      }
    }

    if (skipThreadLoadRef.current === activeThreadId) {
      skipThreadLoadRef.current = null
      setMessages([])
      lastPersistedMessagesRef.current = "[]"
      setThreadLoading(false)
      return () => {
        cancelled = true
      }
    }

    setThreadLoading(true)
    setMessages([])
    void getChatThread(activeThreadId)
      .then((thread) => {
        if (cancelled) return
        const nextMessages = thread.messages ?? []
        setMessages(nextMessages)
        lastPersistedMessagesRef.current = JSON.stringify(nextMessages)
        setThreads((current) => upsertThreadSummary(current, thread))
        setThreadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setThreadError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) {
          setThreadLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeThreadId, setMessages])

  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!queuedMessage || !activeThreadId || isLoading) return
    const text = queuedMessage
    setQueuedMessage(null)
    void sendMessage({ text })
  }, [activeThreadId, isLoading, queuedMessage, sendMessage])

  useEffect(() => {
    if (!activeThreadId || isLoading) return
    const serialized = JSON.stringify(messages)
    if (serialized === lastPersistedMessagesRef.current) return

    const previous = lastPersistedMessagesRef.current
    lastPersistedMessagesRef.current = serialized

    void updateChatThread(activeThreadId, { messages })
      .then((thread) => {
        setThreads((current) => upsertThreadSummary(current, thread))
      })
      .catch(() => {
        lastPersistedMessagesRef.current = previous
      })
  }, [activeThreadId, isLoading, messages])

  const ensureThread = async () => {
    if (activeThreadId) return activeThreadId

    setCreatingThread(true)
    try {
      const thread = await createChatThread()
      skipThreadLoadRef.current = thread.id
      setThreads((current) => upsertThreadSummary(current, thread))
      setActiveThreadId(thread.id)
      sessionIdRef.current = thread.id
      router.push(`/analytics/${thread.id}`)
      return thread.id
    } catch (err) {
      setThreadError((err as Error).message)
      return null
    } finally {
      setCreatingThread(false)
    }
  }

  const queuePrompt = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    const ensuredThreadId = await ensureThread()
    if (!ensuredThreadId) return
    setQueuedMessage(trimmed)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isBusy) return
    setInput("")
    await queuePrompt(text)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const handleCreateThread = async () => {
    if (creatingThread) return
    setThreadError(null)
    setCreatingThread(true)
    try {
      const thread = await createChatThread()
      skipThreadLoadRef.current = thread.id
      lastPersistedMessagesRef.current = "[]"
      setThreads((current) => upsertThreadSummary(current, thread))
      setActiveThreadId(thread.id)
      setInput("")
      router.push(`/analytics/${thread.id}`)
    } catch (err) {
      setThreadError((err as Error).message)
    } finally {
      setCreatingThread(false)
    }
  }

  const handleDeleteThread = async (id: string) => {
    setDeletingThreadId(id)
    try {
      await deleteChatThread(id)
      setThreads((current) => current.filter((thread) => thread.id !== id))
      if (activeThreadId === id) {
        lastPersistedMessagesRef.current = "[]"
        setActiveThreadId(null)
        setMessages([])
        router.push("/analytics")
      }
    } catch (err) {
      setThreadsError((err as Error).message)
    } finally {
      setDeletingThreadId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b bg-muted/10 md:w-72 md:border-b-0 md:border-r">
        <div className="border-b px-4 py-1.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Threads</div>
              <div className="text-xs text-muted-foreground">
                {threads.length} saved conversation
                {threads.length === 1 ? "" : "s"}
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleCreateThread}
              disabled={creatingThread}
              className=""
            >
              {creatingThread ? (
                <IconLoader2 size={12} className="animate-spin" />
              ) : (
                <IconPlus size={12} />
              )}
              New
            </Button>
          </div>

          {threadsError && (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {threadsError}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {threadsLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <IconLoader2 size={12} className="animate-spin" />
              Loading threads…
            </div>
          ) : threads.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No threads yet. Start a new analytics chat.
            </div>
          ) : (
            <div className="space-y-1">
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId
                return (
                  <div
                    key={thread.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
                      isActive
                        ? "border-foreground/15 bg-background"
                        : "border-transparent hover:bg-background/70",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadId(thread.id)
                        router.push(`/analytics/${thread.id}`)
                      }}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <IconMessageCircle
                        size={14}
                        className={cn(
                          "mt-0.5 shrink-0",
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {thread.title || "New chat"}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {thread.last_message_preview || "No messages yet"}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{thread.message_count} msg</span>
                          <span>·</span>
                          <span>{threadTimestamp(thread)}</span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDeleteThread(thread.id)}
                      className={cn(
                        "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        deletingThreadId === thread.id &&
                          "pointer-events-none opacity-50",
                      )}
                      aria-label={`Delete thread ${thread.title || "New chat"}`}
                    >
                      {deletingThreadId === thread.id ? (
                        <IconLoader2 size={12} className="animate-spin" />
                      ) : (
                        <IconTrash size={12} />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {threads.find((thread) => thread.id === activeThreadId)?.title ??
                "Analytics Copilot"}
            </div>
            <div className="text-xs text-muted-foreground">
              Ask questions, run queries, and request access from one thread.
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {threadError ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {threadError}
              </div>
            </div>
          ) : threadLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <IconLoader2 size={14} className="animate-spin" />
              Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-muted-foreground">
              <IconChartBar size={40} className="opacity-15" />
              <p className="text-sm font-medium">
                Ask anything about your data
              </p>
              <div className="flex max-w-md flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setInput(suggestion)
                      textareaRef.current?.focus()
                    }}
                    className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-1 py-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isAnimating={isLoading && message === messages.at(-1)}
                  onSendMessage={(text) => {
                    void queuePrompt(text)
                  }}
                />
              ))}

              {isLoading && messages.at(-1)?.role === "user" && (
                <div className="flex items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground">
                  <IconLoader2 size={14} className="animate-spin" />
                  Thinking…
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 py-4">
          <div className="mx-auto max-w-3xl px-4">
            <div className="rounded-2xl border bg-background">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data… (Enter to send, Shift+Enter for new line)"
                rows={2}
                disabled={isBusy}
                className="w-full resize-none bg-transparent px-4 pb-2 pt-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <Select
                  value={modelId}
                  onValueChange={(value) => setModelId(value as ModelId)}
                >
                  <SelectTrigger className="h-7 w-36 gap-1.5 px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className="text-xs"
                      >
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  disabled={isBusy || !input.trim()}
                  onClick={() => void handleSend()}
                  className="h-7 px-3 text-xs"
                >
                  {isBusy ? (
                    <IconLoader2 size={12} className="animate-spin" />
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
    </div>
  )
}
