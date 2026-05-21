"use client"

import { useChat } from "@ai-sdk/react"
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowDataTransferHorizontalIcon,
  ArrowUp01Icon,
  Cancel01Icon,
  Chart01Icon,
  ChartAreaIcon,
  ChartColumnIcon,
  ChartLineData01Icon,
  ChartScatterIcon,
  CheckmarkCircle01Icon,
  Delete01Icon,
  DragDropIcon,
  Edit02Icon,
  Loading03Icon,
  MoreHorizontalIcon,
  PieChart01Icon,
  PlayIcon,
  Refresh01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import type { ColumnDef } from "@tanstack/react-table"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import ReactECharts from "echarts-for-react"
import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Layout, LayoutItem } from "react-grid-layout"
import ReactGridLayout, { useContainerWidth } from "react-grid-layout"
import { Streamdown } from "streamdown"
import { DataGrid } from "@/components/data-grid/data-grid"
import { SqlCodeEditor } from "@/components/sql-editor"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useDataGrid } from "@/hooks/use-data-grid"
import { useSessionContext } from "@/hooks/use-session-context"
import { apiFetch, getToken } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { MODELS, type ModelId } from "@/services/ai-models"
import type { PanelSummary } from "@/services/dashboard"

import "react-grid-layout/css/styles.css"

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartType = "bar" | "line" | "pie" | "scatter" | "area" | "sankey"

type QueryResult = {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

type PanelData = {
  status: "idle" | "running" | "ok" | "error"
  result: QueryResult | null
  error: string | null
}

type Panel = {
  id: string
  title: string
  chartType: ChartType
  sql: string
  xCol: string
  yCol: string
}

// Tool output shape coming back from createPanel
type CreatePanelOutput = {
  title: string
  sql: string
  chartType: ChartType
  xCol: string
  yCol: string
  explanation: string
  width: number
  height: number
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  error?: string
}

// Tool output shape coming back from editPanel
type EditPanelOutput = {
  panelId: string
  title: string
  sql: string
  chartType: ChartType
  xCol: string
  yCol: string
  explanation: string
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  error?: string
}

// ── ECharts option builder ────────────────────────────────────────────────────

function buildOption(
  chartType: ChartType,
  result: QueryResult,
  xCol: string,
  yCol: string,
) {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  const keys =
    xi >= 0
      ? result.rows.map((r) => String((r as unknown[])[xi] ?? ""))
      : result.rows.map((_, i) => String(i))
  const values =
    yi >= 0
      ? result.rows
          .map((r) => parseFloat(String((r as unknown[])[yi] ?? "0")))
          .filter(Number.isFinite)
      : []

  const textColor = "#71717a"
  const gridColor = "#e4e4e7"
  const base = {
    backgroundColor: "transparent",
    textStyle: { color: textColor, fontFamily: "inherit" },
    tooltip: {
      trigger: chartType === "pie" ? "item" : "axis",
      textStyle: { fontSize: 11 },
    },
  }

  if (chartType === "sankey") {
    const srcIdx = xCol ? result.columns.indexOf(xCol) : 0
    const tgtIdx = yCol ? result.columns.indexOf(yCol) : 1
    const valIdx = result.columns.findIndex((_, i) => i !== srcIdx && i !== tgtIdx)

    const nodeNames = new Set<string>()
    const links: { source: string; target: string; value: number }[] = []

    for (const row of result.rows) {
      const r = row as unknown[]
      const src = String(r[srcIdx] ?? "")
      const tgt = String(r[tgtIdx] ?? "")
      const val = parseFloat(String(r[Math.max(0, valIdx)] ?? "0"))
      if (src && tgt && Number.isFinite(val) && val > 0) {
        nodeNames.add(src)
        nodeNames.add(tgt)
        links.push({ source: src, target: tgt, value: val })
      }
    }

    return {
      ...base,
      series: [
        {
          type: "sankey",
          emphasis: { focus: "adjacency" },
          data: [...nodeNames].map((name) => ({ name })),
          links,
          lineStyle: { color: "gradient", opacity: 0.45 },
          label: { fontSize: 11, color: textColor },
          nodeWidth: 14,
          nodeGap: 10,
          right: "10%",
        },
      ],
    }
  }

  if (chartType === "pie") {
    return {
      ...base,
      legend: {
        orient: "vertical",
        left: "left",
        textStyle: { fontSize: 11, color: textColor },
      },
      series: [
        {
          type: "pie",
          radius: ["32%", "62%"],
          center: ["60%", "50%"],
          data: keys.map((k, i) => ({ name: k, value: values[i] ?? 0 })),
          label: { fontSize: 10, color: textColor },
          itemStyle: { borderRadius: 4 },
        },
      ],
    }
  }
  if (chartType === "scatter") {
    return {
      ...base,
      grid: { left: 40, right: 16, top: 12, bottom: 36, containLabel: false },
      xAxis: {
        type: "category",
        data: keys,
        axisLabel: { fontSize: 10, color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 10, color: textColor },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{ type: "scatter", data: values, symbolSize: 10 }],
    }
  }
  return {
    ...base,
    grid: { left: 44, right: 16, top: 12, bottom: 36, containLabel: false },
    xAxis: {
      type: "category",
      data: keys,
      axisLabel: {
        fontSize: 10,
        color: textColor,
        rotate: keys.length > 6 ? 30 : 0,
      },
      axisLine: { lineStyle: { color: gridColor } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 10, color: textColor },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [
      {
        type: chartType === "area" ? "line" : chartType,
        data: values,
        smooth: chartType === "line" || chartType === "area",
        areaStyle: chartType === "area" ? { opacity: 0.18 } : undefined,
        itemStyle: {
          borderRadius: chartType === "bar" ? [3, 3, 0, 0] : undefined,
        },
      },
    ],
  }
}

// ── Default panels ────────────────────────────────────────────────────────────

const DEFAULT_PANELS: Panel[] = [
  {
    id: "p1",
    title: "HDBank Customers by Segment",
    chartType: "pie",
    sql: "SELECT segment_name, COUNT(*) AS customer_count FROM hdbank.hdbank_partnership_prod_silver.customers_v1 GROUP BY segment_name ORDER BY customer_count DESC",
    xCol: "segment_name",
    yCol: "customer_count",
  },
  {
    id: "p2",
    title: "Co-brand Campaign Reach by Offer",
    chartType: "bar",
    sql: "SELECT offer_name, customer_count, avg_propensity_score FROM partnership.co_brand_gold.campaign_summary_v1 ORDER BY customer_count DESC",
    xCol: "offer_name",
    yCol: "customer_count",
  },
  {
    id: "p3",
    title: "VietJet Activation Candidates by Use Case",
    chartType: "bar",
    sql: "SELECT use_case, COUNT(*) AS candidate_count, ROUND(AVG(propensity_score), 3) AS avg_propensity FROM hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1 GROUP BY use_case ORDER BY candidate_count DESC",
    xCol: "use_case",
    yCol: "candidate_count",
  },
  {
    id: "p4",
    title: "Co-brand Audience by Priority Band",
    chartType: "bar",
    sql: "SELECT priority_band, COUNT(*) AS customer_count FROM partnership.co_brand_gold.co_brand_offer_audience_v1 GROUP BY priority_band ORDER BY customer_count DESC",
    xCol: "priority_band",
    yCol: "customer_count",
  },
  {
    id: "p5",
    title: "Partnership Customer Flow",
    chartType: "sankey",
    sql: [
      "SELECT '↑ ' || source_company AS source, offer_name AS target, SUM(customer_count) AS value",
      "FROM partnership.co_brand_gold.campaign_summary_v1",
      "GROUP BY source_company, offer_name",
      "UNION ALL",
      "SELECT offer_name AS source, '↓ ' || target_company AS target, SUM(customer_count) AS value",
      "FROM partnership.co_brand_gold.campaign_summary_v1",
      "GROUP BY offer_name, target_company",
    ].join(" "),
    xCol: "source",
    yCol: "target",
  },
]

const DEFAULT_LAYOUT: Layout = [
  { i: "p1", x: 0, y: 0, w: 6, h: 4 },
  { i: "p2", x: 6, y: 0, w: 6, h: 4 },
  { i: "p3", x: 0, y: 4, w: 6, h: 4 },
  { i: "p4", x: 6, y: 4, w: 6, h: 4 },
  { i: "p5", x: 0, y: 8, w: 12, h: 5 },
]

// ── PreviewGrid ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function PreviewGrid({ result }: { result: QueryResult }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(200)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setHeight(e[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () =>
      result.rows.map((row) =>
        Object.fromEntries(
          result.columns.map((col, i) => [col, (row as unknown[])[i]]),
        ),
      ),
    [result],
  )
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      result.columns.map((col) => ({
        id: col,
        accessorKey: col,
        header: col,
        size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
        meta: { cell: { variant: "short-text" as const } },
      })),
    [result],
  )
  const { table, ...gridProps } = useDataGrid<Row>({
    data,
    columns,
    readOnly: true,
  })
  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <DataGrid table={table} {...gridProps} height={height} />
    </div>
  )
}

// ── PanelCard ─────────────────────────────────────────────────────────────────

function PanelCard({
  panel,
  data,
  editing,
  selected,
  onClick,
  onDelete,
}: {
  panel: Panel
  data: PanelData
  editing: boolean
  selected: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const option = useMemo(() => {
    if (data.status === "ok" && data.result && panel.xCol && panel.yCol)
      return buildOption(panel.chartType, data.result, panel.xCol, panel.yCol)
    return null
  }, [data, panel.chartType, panel.xCol, panel.yCol])

  return (
    <div
      className={cn(
        "h-full flex flex-col rounded-lg border bg-card overflow-hidden transition-all",
        selected && "ring-2 ring-primary border-primary",
        editing && !selected && "border-dashed",
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "panel-drag-handle flex items-center gap-1.5 px-3 py-2 border-b bg-muted/20 shrink-0 select-none",
          editing && "cursor-grab active:cursor-grabbing",
        )}
      >
        {editing && (
          <HugeiconsIcon
            icon={DragDropIcon}
            size={12}
            className="text-muted-foreground shrink-0"
          />
        )}
        <span className="text-xs font-medium flex-1 truncate">
          {panel.title}
        </span>
        {data.status === "running" && (
          <HugeiconsIcon
            icon={Loading03Icon}
            size={12}
            className="text-muted-foreground animate-spin shrink-0"
          />
        )}
        {data.status === "error" && (
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={12}
            className="text-destructive shrink-0"
          />
        )}
        {data.status === "ok" && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {data.result?.row_count} rows
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
              onClick={(e) => e.stopPropagation()}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onClick()
              }}
            >
              <HugeiconsIcon icon={Edit02Icon} size={12} className="mr-2" />
              Configure
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="text-destructive focus:text-destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 min-h-0 p-1">
        {data.status === "idle" && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <HugeiconsIcon icon={ChartColumnIcon} size={22} />
            <p className="text-[11px]">Click to configure</p>
          </div>
        )}
        {data.status === "running" && <Skeleton className="h-full w-full" />}
        {data.status === "error" && (
          <div className="h-full flex items-center justify-center p-3">
            <p className="text-[11px] text-destructive text-center whitespace-pre-wrap">
              {data.error}
            </p>
          </div>
        )}
        {data.status === "ok" && option && (
          <ReactECharts
            option={option}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "svg" }}
            notMerge
          />
        )}
        {data.status === "ok" && !option && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <HugeiconsIcon icon={CheckmarkCircle01Icon} size={22} />
            <p className="text-[11px]">
              {data.result?.row_count} rows — configure X/Y columns
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chart type config ─────────────────────────────────────────────────────────

const CHART_TYPE_CONFIG: Record<
  ChartType,
  { label: string; icon: IconSvgElement }
> = {
  bar: { label: "Bar", icon: ChartColumnIcon },
  line: { label: "Line", icon: ChartLineData01Icon },
  area: { label: "Area", icon: ChartAreaIcon },
  pie: { label: "Pie / Donut", icon: PieChart01Icon },
  scatter: { label: "Scatter", icon: ChartScatterIcon },
  sankey: { label: "Sankey / Flow", icon: ArrowDataTransferHorizontalIcon },
}

// ── PanelSidebar ──────────────────────────────────────────────────────────────

function PanelSidebar({
  panel,
  data,
  onChange,
  onRun,
}: {
  panel: Panel
  data: PanelData
  onChange: (p: Panel) => void
  onRun: (p: Panel) => void
}) {
  const uid = useId()
  const columns = data.result?.columns ?? []
  const isRunning = data.status === "running"

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
          Panel
        </p>
        <Input
          value={panel.title}
          onChange={(e) => onChange({ ...panel, title: e.target.value })}
          className="h-7 text-xs"
          placeholder="Panel title"
        />
      </div>
      <div className="px-4 py-3 border-b shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            SQL Query
          </Label>
          <Button
            size="sm"
            className="h-6 gap-1 text-[11px] px-2"
            disabled={isRunning || !panel.sql.trim()}
            onClick={() => onRun(panel)}
          >
            {isRunning ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={11}
                className="animate-spin"
              />
            ) : (
              <HugeiconsIcon icon={PlayIcon} size={11} />
            )}
            Run
          </Button>
        </div>
        <div
          id={`${uid}-sql`}
          className="min-h-[160px] overflow-hidden rounded-md border bg-background"
        >
          <SqlCodeEditor
            value={panel.sql}
            onChange={(value) => onChange({ ...panel, sql: value })}
            onSubmit={() => {
              if (!isRunning && panel.sql.trim()) onRun(panel)
            }}
            lineNumbers="off"
            className="h-full"
            editorClassName="min-h-[160px]"
          />
        </div>
        {data.status === "error" && (
          <p className="text-[10px] text-destructive whitespace-pre-wrap">
            {data.error}
          </p>
        )}
        {data.status === "ok" && (
          <p className="text-[10px] text-muted-foreground">
            {data.result?.row_count} rows returned
          </p>
        )}
      </div>
      <div className="px-4 py-3 flex flex-col gap-3 shrink-0">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Visualization
        </Label>
        <div className="grid gap-1.5">
          <Label
            htmlFor={`${uid}-type`}
            className="text-xs text-muted-foreground"
          >
            Chart Type
          </Label>
          <Select
            value={panel.chartType}
            onValueChange={(v) =>
              onChange({ ...panel, chartType: v as ChartType })
            }
          >
            <SelectTrigger id={`${uid}-type`} className="h-7 text-xs w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHART_TYPE_CONFIG) as ChartType[]).map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  textValue={CHART_TYPE_CONFIG[type].label}
                >
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon
                      icon={CHART_TYPE_CONFIG[type].icon}
                      size={12}
                      className="shrink-0"
                    />
                    {CHART_TYPE_CONFIG[type].label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label
            htmlFor={`${uid}-xcol`}
            className="text-xs text-muted-foreground"
          >
            X Column
          </Label>
          {columns.length > 0 ? (
            <Select
              value={panel.xCol}
              onValueChange={(v) => onChange({ ...panel, xCol: v })}
            >
              <SelectTrigger id={`${uid}-xcol`} className="h-7 text-xs w-full">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${uid}-xcol`}
              value={panel.xCol}
              onChange={(e) => onChange({ ...panel, xCol: e.target.value })}
              placeholder="column name"
              className="h-7 text-xs font-mono w-full"
            />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label
            htmlFor={`${uid}-ycol`}
            className="text-xs text-muted-foreground"
          >
            Y Column
          </Label>
          {columns.length > 0 ? (
            <Select
              value={panel.yCol}
              onValueChange={(v) => onChange({ ...panel, yCol: v })}
            >
              <SelectTrigger id={`${uid}-ycol`} className="h-7 text-xs w-full">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${uid}-ycol`}
              value={panel.yCol}
              onChange={(e) => onChange({ ...panel, yCol: e.target.value })}
              placeholder="column name"
              className="h-7 text-xs font-mono w-full"
            />
          )}
        </div>
      </div>
      {data.status === "ok" && data.result && (
        <>
          <Separator />
          <div className="px-4 pt-3 pb-1 shrink-0">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Preview
            </Label>
          </div>
          <div className="flex-1 min-h-0">
            <PreviewGrid result={data.result} />
          </div>
        </>
      )}
    </div>
  )
}

// ── AI Composer (left sidebar) ────────────────────────────────────────────────

const SUGGESTIONS = [
  "HDBank customers by preferred channel",
  "VietJet membership tiers by average booking value",
  "Travel affinity score distribution across HDBank customers",
  "HDBank finance candidates from VietJet by propensity",
  "Shared customers between HDBank and VietJet",
  "Co-brand signal value by source company",
]

function AiComposer({
  sessionId,
  modelId,
  panels,
  selectedPanelId,
  onModelChange,
  onPanelsCreated,
  onPanelsEdited,
}: {
  sessionId: string | null
  modelId: ModelId
  panels: Panel[]
  selectedPanelId: string | null
  onModelChange: (m: ModelId) => void
  onPanelsCreated: (
    panels: Panel[],
    results: Record<string, QueryResult>,
  ) => void
  onPanelsEdited: (
    updates: Array<{ panel: Panel; result: QueryResult }>,
  ) => void
}) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef(sessionId)
  const modelIdRef = useRef(modelId)
  const panelsRef = useRef(panels)
  const selectedPanelIdRef = useRef(selectedPanelId)
  const lastCreatedIdsRef = useRef<string[]>([])
  const onPanelsCreatedRef = useRef(onPanelsCreated)
  const onPanelsEditedRef = useRef(onPanelsEdited)

  const { fetchSessions, setActiveId } = useSessionContext()

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  useEffect(() => {
    modelIdRef.current = modelId
  }, [modelId])
  useEffect(() => {
    panelsRef.current = panels
  }, [panels])
  useEffect(() => {
    selectedPanelIdRef.current = selectedPanelId
  }, [selectedPanelId])
  useEffect(() => {
    onPanelsCreatedRef.current = onPanelsCreated
  }, [onPanelsCreated])
  useEffect(() => {
    onPanelsEditedRef.current = onPanelsEdited
  }, [onPanelsEdited])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/dashboard/generate",
        body: () => ({
          sessionId: sessionIdRef.current,
          modelId: modelIdRef.current,
          panels: panelsRef.current.map<PanelSummary>((p) => ({
            id: p.id,
            title: p.title,
            chartType: p.chartType,
            sql: p.sql,
            xCol: p.xCol,
            yCol: p.yCol,
          })),
          selectedPanelId: selectedPanelIdRef.current,
          lastCreatedIds: lastCreatedIdsRef.current,
        }),
        fetch: async (input, init) => {
          const res = await fetch(input, init)
          const newSessionId = res.headers.get("X-Session-Id")
          if (newSessionId && newSessionId !== sessionIdRef.current) {
            await fetchSessions()
            setActiveId(newSessionId)
          }
          return res
        },
      }),
    [fetchSessions, setActiveId],
  )

  const { messages, sendMessage, status } = useChat({ transport })
  const isLoading = status === "submitted" || status === "streaming"

  // When tool calls land, apply creates and edits to the dashboard
  useEffect(() => {
    const last = messages.at(-1)
    if (!last || last.role !== "assistant") return

    const newPanels: Panel[] = []
    const newResults: Record<string, QueryResult> = {}
    const editedUpdates: Array<{ panel: Panel; result: QueryResult }> = []

    for (const part of last.parts) {
      if (!isToolUIPart(part)) continue
      if (part.state !== "output-available") continue

      const toolName = getToolName(part)

      if (toolName === "createPanel") {
        const out = part.output as CreatePanelOutput
        if (out.error || !out.columns || !out.rows) continue
        const id = `ai-${part.toolCallId}`
        newPanels.push({
          id,
          title: out.title,
          chartType: out.chartType,
          sql: out.sql,
          xCol: out.xCol,
          yCol: out.yCol,
        })
        newResults[id] = {
          columns: out.columns,
          rows: out.rows,
          row_count: out.row_count ?? out.rows.length,
        }
      }

      if (toolName === "editPanel") {
        const out = part.output as EditPanelOutput
        if (out.error || !out.columns || !out.rows) continue
        editedUpdates.push({
          panel: {
            id: out.panelId,
            title: out.title,
            chartType: out.chartType,
            sql: out.sql,
            xCol: out.xCol,
            yCol: out.yCol,
          },
          result: {
            columns: out.columns,
            rows: out.rows,
            row_count: out.row_count ?? out.rows.length,
          },
        })
      }
    }

    if (newPanels.length > 0) {
      lastCreatedIdsRef.current = newPanels.map((p) => p.id)
      onPanelsCreatedRef.current(newPanels, newResults)
    }
    if (editedUpdates.length > 0) {
      onPanelsEditedRef.current(editedUpdates)
    }
    // only fire when message list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput("")
    sendMessage({ text })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Ask about your data and AI will generate dashboard panels.
            </p>
            <div className="flex flex-col gap-1.5 mt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s)
                    textareaRef.current?.focus()
                  }}
                  className="text-left text-xs px-2.5 py-1.5 rounded border hover:bg-accent transition-colors text-foreground/80"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {messages.map((msg) => (
              <ComposerMessage
                key={msg.id}
                message={msg}
                isAnimating={isLoading && msg === messages.at(-1)}
              />
            ))}
            {isLoading && messages.at(-1)?.role === "user" && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={12}
                  className="animate-spin"
                />
                Generating panels…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-2.5 flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about revenue, trends, customers…"
          rows={3}
          className="w-full resize-none text-xs rounded-md border bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2">
          <Select
            value={modelId}
            onValueChange={(v) => onModelChange(v as ModelId)}
          >
            <SelectTrigger className="h-7 text-xs flex-1 shadow-none bg-transparent px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs shrink-0"
            disabled={!input.trim() || isLoading}
            onClick={handleSend}
          >
            {isLoading ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={12}
                className="animate-spin"
              />
            ) : (
              <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
            )}
            Generate
          </Button>
        </div>
      </div>
    </div>
  )
}

function ComposerMessage({
  message,
  isAnimating,
}: {
  message: UIMessage
  isAnimating: boolean
}) {
  const isUser = message.role === "user"

  if (isUser) {
    const text = message.parts.find((p) => p.type === "text")?.text ?? ""
    return (
      <div className="px-3 py-1.5 flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary text-primary-foreground px-3 py-1.5 text-xs whitespace-pre-wrap">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-1.5">
      <div className="space-y-1">
        {message.parts.map((part, i) => (
          <ComposerMessagePart key={i} part={part} isAnimating={isAnimating} />
        ))}
      </div>
    </div>
  )
}

function ComposerMessagePart({
  part,
  isAnimating,
}: {
  part: UIMessagePart<UIDataTypes, UITools>
  isAnimating: boolean
}) {
  if (part.type === "text") {
    if (!part.text.trim()) return null
    return (
      <Streamdown
        animated
        isAnimating={isAnimating}
        className="text-xs leading-relaxed"
      >
        {part.text}
      </Streamdown>
    )
  }

  if (isToolUIPart(part)) {
    const toolName = getToolName(part)

    if (toolName === "createPanel") {
      if (
        part.state === "input-streaming" ||
        part.state === "input-available"
      ) {
        const inp = part.input as { title?: string } | undefined
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={11}
              className="animate-spin shrink-0"
            />
            {inp?.title ? `Creating: ${inp.title}` : "Creating panel…"}
          </div>
        )
      }
      if (part.state === "output-available") {
        const out = part.output as CreatePanelOutput
        if (out.error)
          return (
            <div className="text-xs text-destructive py-0.5">
              Failed to create "{out.title}": {out.error}
            </div>
          )
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
            <HugeiconsIcon
              icon={Chart01Icon}
              size={11}
              className="text-primary shrink-0"
            />
            <span>
              Added <strong className="text-foreground">{out.title}</strong>
            </span>
            <span className="ml-auto">{out.row_count ?? 0} rows</span>
          </div>
        )
      }
    }

    if (toolName === "editPanel") {
      if (
        part.state === "input-streaming" ||
        part.state === "input-available"
      ) {
        const inp = part.input as { title?: string } | undefined
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={11}
              className="animate-spin shrink-0"
            />
            {inp?.title ? `Editing: ${inp.title}` : "Editing panel…"}
          </div>
        )
      }
      if (part.state === "output-available") {
        const out = part.output as EditPanelOutput
        if (out.error)
          return (
            <div className="text-xs text-destructive py-0.5">
              Failed to edit "{out.title}": {out.error}
            </div>
          )
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
            <HugeiconsIcon
              icon={Edit02Icon}
              size={11}
              className="text-primary shrink-0"
            />
            <span>
              Updated <strong className="text-foreground">{out.title}</strong>
            </span>
            <span className="ml-auto">{out.row_count ?? 0} rows</span>
          </div>
        )
      }
    }
  }

  return null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 380
const COMPOSER_MIN = 200
const COMPOSER_MAX = 600
const COMPOSER_DEFAULT = 340

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { width, containerRef, mounted } = useContainerWidth()
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS)
  const [panelData, setPanelData] = useState<Record<string, PanelData>>(() =>
    Object.fromEntries(
      DEFAULT_PANELS.map((p) => [
        p.id,
        { status: "idle", result: null, error: null },
      ]),
    ),
  )
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [composerWidth, setComposerWidth] = useState(COMPOSER_DEFAULT)
  const [modelId, setModelId] = useState<ModelId>("gpt-5.4-nano")
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const composerDragRef = useRef<{ startX: number; startW: number } | null>(
    null,
  )
  const abortRefs = useRef<Record<string, AbortController>>({})

  const { activeId } = useSessionContext()

  const runQuery = useCallback(async (panel: Panel) => {
    if (!panel.sql.trim()) return
    abortRefs.current[panel.id]?.abort()
    const ctrl = new AbortController()
    abortRefs.current[panel.id] = ctrl
    setPanelData((prev) => ({
      ...prev,
      [panel.id]: { status: "running", result: null, error: null },
    }))
    try {
      const idToken = await getToken()
      const res = await apiFetch("/api/sessions/default/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: panel.sql, idToken }),
        signal: ctrl.signal,
      })
      const json = await res.json()
      if (!res.ok)
        throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`)
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { status: "ok", result: json, error: null },
      }))
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: {
          status: "error",
          result: null,
          error: (err as Error).message,
        },
      }))
    }
  }, [])

  const hasAutoRun = useRef(false)
  useEffect(() => {
    if (hasAutoRun.current) return
    hasAutoRun.current = true
    for (const panel of panels) {
      if (panel.sql.trim()) runQuery(panel)
    }
    // panels intentionally excluded — only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runQuery])

  const handlePanelChange = useCallback((updated: Panel) => {
    setPanels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }, [])

  const handleAddPanel = () => {
    const id = `p${Date.now()}`
    const panel: Panel = {
      id,
      title: "New Panel",
      chartType: "bar",
      sql: "",
      xCol: "",
      yCol: "",
    }
    setPanels((prev) => [...prev, panel])
    setPanelData((prev) => ({
      ...prev,
      [id]: { status: "idle", result: null, error: null },
    }))
    setLayout((prev) => [
      ...prev,
      { i: id, x: 0, y: Infinity, w: 6, h: 4 } as LayoutItem,
    ])
    setSelectedId(id)
  }

  const handleDeletePanel = (id: string) => {
    abortRefs.current[id]?.abort()
    setPanels((prev) => prev.filter((p) => p.id !== id))
    setPanelData((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setLayout((prev) => prev.filter((l) => l.i !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // Called by AiComposer when editPanel tool calls complete
  const handlePanelsEdited = useCallback(
    (updates: Array<{ panel: Panel; result: QueryResult }>) => {
      setPanels((prev) =>
        prev.map((p) => {
          const upd = updates.find((u) => u.panel.id === p.id)
          return upd ? upd.panel : p
        }),
      )
      setPanelData((prev) => {
        const next = { ...prev }
        for (const { panel, result } of updates) {
          next[panel.id] = { status: "ok", result, error: null }
        }
        return next
      })
    },
    [],
  )

  // Called by AiComposer when createPanel tool calls complete
  const handlePanelsCreated = useCallback(
    (newPanels: Panel[], results: Record<string, QueryResult>) => {
      setPanels((prev) => {
        // deduplicate by id — same tool call id shouldn't add twice
        const existingIds = new Set(prev.map((p) => p.id))
        const toAdd = newPanels.filter((p) => !existingIds.has(p.id))
        return [...prev, ...toAdd]
      })
      setPanelData((prev) => {
        const updates: Record<string, PanelData> = {}
        for (const [id, result] of Object.entries(results)) {
          if (!prev[id] || prev[id].status === "idle") {
            updates[id] = { status: "ok", result, error: null }
          }
        }
        return { ...prev, ...updates }
      })
      setLayout((prev) => {
        const existingIds = new Set(prev.map((l) => l.i))
        const newItems: LayoutItem[] = newPanels
          .filter((p) => !existingIds.has(p.id))
          .map(
            (p, i) =>
              ({
                i: p.id,
                x: (i % 2) * 6,
                y: Infinity,
                w: 6,
                h: 4,
              }) as LayoutItem,
          )
        return [...prev, ...newItems]
      })
    },
    [],
  )

  const refreshAll = () => {
    for (const panel of panels) {
      if (panel.sql.trim()) runQuery(panel)
    }
  }

  // Resize handlers
  const makeDragHandler =
    (
      dragRef: typeof sidebarDragRef,
      setWidth: (w: number) => void,
      min: number,
      max: number,
      direction: "left" | "right",
    ) =>
    (e: ReactMouseEvent) => {
      e.preventDefault()
      dragRef.current = {
        startX: e.clientX,
        startW: direction === "left" ? composerWidth : sidebarWidth,
      }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta =
          direction === "left"
            ? ev.clientX - dragRef.current.startX
            : dragRef.current.startX - ev.clientX
        setWidth(Math.min(max, Math.max(min, dragRef.current.startW + delta)))
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    }

  const selectedPanel = panels.find((p) => p.id === selectedId) ?? null
  const selectedData = selectedId
    ? (panelData[selectedId] ?? { status: "idle", result: null, error: null })
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Full-width toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 gap-4">
        <div></div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={refreshAll}
            title="Re-run all panels"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleAddPanel}
          >
            <HugeiconsIcon icon={Add01Icon} size={13} />
            Add Panel
          </Button>
          <Button
            variant={editing ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setEditing((v) => !v)
              if (editing) setSelectedId(null)
            }}
          >
            {editing ? (
              <>
                <HugeiconsIcon icon={Cancel01Icon} size={13} />
                Done
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Chart01Icon} size={13} />
                Edit Layout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: AI Composer */}
        <div className="flex shrink-0 h-full" style={{ width: composerWidth }}>
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r bg-background">
            <AiComposer
              sessionId={activeId}
              modelId={modelId}
              panels={panels}
              selectedPanelId={selectedId}
              onModelChange={setModelId}
              onPanelsCreated={handlePanelsCreated}
              onPanelsEdited={handlePanelsEdited}
            />
          </div>
          {/* Composer resize handle (right edge) */}
          <div
            className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors bg-border"
            onMouseDown={makeDragHandler(
              composerDragRef,
              setComposerWidth,
              COMPOSER_MIN,
              COMPOSER_MAX,
              "left",
            )}
          />
        </div>

        {/* Center: Grid */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 overflow-auto p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null)
          }}
        >
          {panels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <HugeiconsIcon
                icon={SparklesIcon}
                size={36}
                className="opacity-20"
              />
              <p className="text-sm">
                Ask the AI composer to generate panels, or click{" "}
                <strong>Add Panel</strong>.
              </p>
            </div>
          ) : mounted ? (
            <ReactGridLayout
              width={width}
              layout={layout}
              gridConfig={{ cols: 12, rowHeight: 60, margin: [8, 8] }}
              dragConfig={{ enabled: editing, handle: ".panel-drag-handle" }}
              resizeConfig={{ enabled: editing, handles: ["se"] }}
              onLayoutChange={setLayout}
            >
              {panels.map((panel) => (
                <div key={panel.id}>
                  <PanelCard
                    panel={panel}
                    data={
                      panelData[panel.id] ?? {
                        status: "idle",
                        result: null,
                        error: null,
                      }
                    }
                    editing={editing}
                    selected={selectedId === panel.id}
                    onClick={() =>
                      setSelectedId((prev) =>
                        prev === panel.id ? null : panel.id,
                      )
                    }
                    onDelete={() => handleDeletePanel(panel.id)}
                  />
                </div>
              ))}
            </ReactGridLayout>
          ) : null}
        </div>

        {/* Right: Panel config sidebar */}
        {selectedPanel && selectedData && (
          <div className="flex shrink-0 h-full" style={{ width: sidebarWidth }}>
            <div
              className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors bg-border"
              onMouseDown={makeDragHandler(
                sidebarDragRef,
                setSidebarWidth,
                SIDEBAR_MIN,
                SIDEBAR_MAX,
                "right",
              )}
            />
            <div className="flex flex-col flex-1 min-w-0 overflow-auto border-l bg-background">
              <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
                <span className="text-xs font-semibold">Panel Config</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedId(null)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={13} />
                </button>
              </div>
              <PanelSidebar
                panel={selectedPanel}
                data={selectedData}
                onChange={handlePanelChange}
                onRun={runQuery}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
