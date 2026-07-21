"use client"

import { useChat } from "@ai-sdk/react"
import {
  IconAlertCircle,
  IconChartArea,
  IconChartBar,
  IconChartDots,
  IconChartHistogram,
  IconChartPie,
  IconChartSankey,
  IconChartScatter,
  IconCheck,
  IconDotsVertical,
  IconGripVertical,
  IconLoader2,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconSend2,
  IconSparkles,
  IconTrash,
  IconX,
  type TablerIcon,
} from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
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
import useMeasure from "react-use-measure"
import { Streamdown } from "streamdown"
import { Area, AreaChart } from "@/components/charts/area-chart"
import { Bar } from "@/components/charts/bar"
import { BarChart } from "@/components/charts/bar-chart"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import type { FunnelStage } from "@/components/charts/funnel-chart"
import { FunnelChart } from "@/components/charts/funnel-chart"
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
import { SqlCodeEditor } from "@/components/sql-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDataGrid } from "@/hooks/use-data-grid"
import { useSessionContext } from "@/hooks/use-session-context"
import { apiFetch, getToken } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { MODELS, type ModelId } from "@/services/ai-models"
import type { PanelSummary } from "@/services/dashboard"

import "react-grid-layout/css/styles.css"

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "scatter"
  | "area"
  | "sankey"
  | "funnel"
  | "heatmap"

interface QueryResult {
  columns: string[]
  row_count: number
  rows: unknown[][]
}

interface PanelData {
  error: string | null
  result: QueryResult | null
  status: "idle" | "running" | "ok" | "error"
}

interface Panel {
  chartType: ChartType
  description?: string
  id: string
  sql: string
  title: string
  xCol: string
  yCol: string
  yCols?: string[]
}

type ResultRow = Record<string, unknown>

// Tool output shape coming back from createPanel
interface CreatePanelOutput {
  chartType: ChartType
  columns?: string[]
  error?: string
  explanation: string
  height: number
  row_count?: number
  rows?: unknown[][]
  sql: string
  title: string
  width: number
  xCol: string
  yCol: string
}

// Tool output shape coming back from editPanel
interface EditPanelOutput {
  chartType: ChartType
  columns?: string[]
  error?: string
  explanation: string
  panelId: string
  row_count?: number
  rows?: unknown[][]
  sql: string
  title: string
  xCol: string
  yCol: string
}

// ── Bklit data helpers ────────────────────────────────────────────────────────

function toBarChartData(result: QueryResult, xCol: string, yCol: string) {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  return result.rows.map((row) => {
    const r = row as unknown[]
    return {
      [xCol]: String(r[xi] ?? ""),
      [yCol]: Number.parseFloat(String(r[yi] ?? "0")) || 0,
    }
  })
}

function toPieData(result: QueryResult, xCol: string, yCol: string): PieData[] {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  return result.rows.map((row) => {
    const r = row as unknown[]
    return {
      label: String(r[xi] ?? ""),
      value: Number.parseFloat(String(r[yi] ?? "0")) || 0,
    }
  })
}

function toFunnelData(
  result: QueryResult,
  xCol: string,
  yCol: string
): FunnelStage[] {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  return result.rows.map((row) => {
    const r = row as unknown[]
    return {
      label: String(r[xi] ?? ""),
      value: Number.parseFloat(String(r[yi] ?? "0")) || 0,
    }
  })
}

function toStackedBarData(result: QueryResult, xCol: string, yCols: string[]) {
  const xi = result.columns.indexOf(xCol)
  return result.rows.map((row) => {
    const r = row as unknown[]
    const obj: Record<string, unknown> = { [xCol]: String(r[xi] ?? "") }
    for (const col of yCols) {
      const ci = result.columns.indexOf(col)
      obj[col] = ci >= 0 ? Number.parseFloat(String(r[ci] ?? "0")) || 0 : 0
    }
    return obj
  })
}

function toSankeyData(
  result: QueryResult,
  xCol: string,
  yCol: string
): SankeyData {
  const srcIdx = xCol ? result.columns.indexOf(xCol) : 0
  const tgtIdx = yCol ? result.columns.indexOf(yCol) : 1
  const srcLabelCol = xCol.endsWith("_key")
    ? xCol.replace(/_key$/, "_label")
    : `${xCol}_label`
  const tgtLabelCol = yCol.endsWith("_key")
    ? yCol.replace(/_key$/, "_label")
    : `${yCol}_label`
  const srcLabelIdx = result.columns.indexOf(srcLabelCol)
  const tgtLabelIdx = result.columns.indexOf(tgtLabelCol)
  const valIdx =
    result.columns.findIndex((column) =>
      ["value", "signal_value", "customers", "count"].includes(column)
    ) >= 0
      ? result.columns.findIndex((column) =>
          ["value", "signal_value", "customers", "count"].includes(column)
        )
      : result.columns.findIndex(
          (column, i) =>
            i !== srcIdx &&
            i !== tgtIdx &&
            i !== srcLabelIdx &&
            i !== tgtLabelIdx &&
            !column.endsWith("_label")
        )
  const rowValue = (row: unknown, index: number) => (row as unknown[])[index]

  const nodeIds = new Set<string>()
  const nodeLabels = new Map<string, string>()
  const rawLinks: { source: string; target: string; value: number }[] = []

  for (const row of result.rows) {
    const src = String(rowValue(row, srcIdx) ?? "")
    const tgt = String(rowValue(row, tgtIdx) ?? "")
    const srcLabel = String(
      rowValue(row, srcLabelIdx >= 0 ? srcLabelIdx : srcIdx) ?? src
    )
    const tgtLabel = String(
      rowValue(row, tgtLabelIdx >= 0 ? tgtLabelIdx : tgtIdx) ?? tgt
    )
    const val = Number.parseFloat(
      String(rowValue(row, Math.max(0, valIdx)) ?? "0")
    )
    if (src && tgt && src !== tgt && Number.isFinite(val) && val > 0) {
      nodeIds.add(src)
      nodeIds.add(tgt)
      nodeLabels.set(src, srcLabel)
      nodeLabels.set(tgt, tgtLabel)
      rawLinks.push({ source: src, target: tgt, value: val })
    }
  }

  const nodeArray = [...nodeIds]
  const nodeIndexById = new Map(nodeArray.map((id, index) => [id, index]))
  return {
    links: rawLinks.map((l) => ({
      source: nodeIndexById.get(l.source) ?? 0,
      target: nodeIndexById.get(l.target) ?? 0,
      value: l.value,
    })),
    nodes: nodeArray.map((id) => ({
      name: nodeLabels.get(id) ?? id,
      nodeKey: id,
    })),
  }
}

function resultToRows(result: QueryResult | null | undefined): ResultRow[] {
  if (!result) {
    return []
  }
  return result.rows.map((row) =>
    Object.fromEntries(
      result.columns.map((column, index) => [column, (row as unknown[])[index]])
    )
  )
}

function getNumberValue(row: ResultRow | undefined, key: string) {
  const value = row?.[key]
  const numeric =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(numeric) ? numeric : null
}

function getTextValue(row: ResultRow | undefined, key: string) {
  const value = row?.[key]
  return value === null ? null : String(value)
}

function formatCompactNumber(value: number | null, suffix = "") {
  if (value === null) {
    return "Loading"
  }
  return `${new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value)}${suffix}`
}

// ── ScatterPlot ───────────────────────────────────────────────────────────────

function ScatterPlot({
  result,
  xCol,
  yCol,
}: {
  result: QueryResult
  xCol: string
  yCol: string
}) {
  const [ref, { width, height }] = useMeasure({ debounce: 10 })
  const m = { bottom: 40, left: 48, right: 18, top: 16 }
  const textColor = "#71717a"
  const gridColor = "#e4e4e7"
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)

  const points = useMemo(
    () =>
      result.rows.flatMap((row) => {
        const r = row as unknown[]
        const x = Number.parseFloat(String(r[xi] ?? ""))
        const y = Number.parseFloat(String(r[yi] ?? ""))
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : []
      }),
    [result, xi, yi]
  )

  const iw = Math.max(0, width - m.left - m.right)
  const ih = Math.max(0, height - m.top - m.bottom)

  const { xScale, yScale, xTicks, yTicks } = useMemo(() => {
    if (!(points.length && iw && ih)) {
      return {
        xScale: (_: number) => 0,
        xTicks: [] as number[],
        yScale: (_: number) => ih,
        yTicks: [] as number[],
      }
    }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const xMin = Math.min(...xs),
      xMax = Math.max(...xs)
    const yMin = Math.min(...ys),
      yMax = Math.max(...ys)
    const xPad = (xMax - xMin) * 0.06 || 1
    const yPad = (yMax - yMin) * 0.1 || 1
    const xD = [xMin - xPad, xMax + xPad]
    const yD = [yMin - yPad, yMax + yPad]
    const xR = xD[1] - xD[0],
      yR = yD[1] - yD[0]
    const xScale = (v: number) => ((v - xD[0]) / xR) * iw
    const yScale = (v: number) => ih - ((v - yD[0]) / yR) * ih
    const n = 4
    const xTicks = Array.from({ length: n + 1 }, (_, i) => xD[0] + (i / n) * xR)
    const yTicks = Array.from({ length: n + 1 }, (_, i) => yD[0] + (i / n) * yR)
    return { xScale, xTicks, yScale, yTicks }
  }, [points, iw, ih])

  const fmt = (n: number) =>
    Math.abs(n) >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `${(n / 1e3).toFixed(1)}k`
        : Number.isInteger(n)
          ? String(n)
          : n.toFixed(1)

  return (
    <div className="h-full w-full" ref={ref}>
      {width > 0 && height > 0 && (
        <svg height={height} width={width}>
          <g transform={`translate(${m.left},${m.top})`}>
            {yTicks.map((t) => (
              <line
                key={t}
                stroke={gridColor}
                strokeWidth={1}
                x1={0}
                x2={iw}
                y1={yScale(t)}
                y2={yScale(t)}
              />
            ))}
            {yTicks.map((t) => (
              <text
                dominantBaseline="middle"
                fill={textColor}
                fontSize={10}
                key={t}
                textAnchor="end"
                x={-6}
                y={yScale(t)}
              >
                {fmt(t)}
              </text>
            ))}
            {xTicks.map((t) => (
              <text
                fill={textColor}
                fontSize={10}
                key={t}
                textAnchor="middle"
                x={xScale(t)}
                y={ih + 14}
              >
                {fmt(t)}
              </text>
            ))}
            <text
              fill={textColor}
              fontSize={10}
              textAnchor="middle"
              x={iw / 2}
              y={ih + 30}
            >
              {xCol}
            </text>
            {points.map((p, i) => (
              <circle
                cx={xScale(p.x)}
                cy={yScale(p.y)}
                fill="var(--chart-1)"
                key={i}
                opacity={0.72}
                r={5}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}

// ── HeatmapChart ──────────────────────────────────────────────────────────────

function HeatmapChart({
  result,
  xCol,
  yCol,
}: {
  result: QueryResult
  xCol: string
  yCol: string
}) {
  const [ref, { width, height }] = useMeasure({ debounce: 10 })
  const m = { bottom: 56, left: 88, right: 24, top: 16 }
  const textColor = "#71717a"
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  const valIdx = result.columns.findIndex((_, i) => {
    if (i === xi || i === yi) {
      return false
    }
    return result.rows.some((row) =>
      Number.isFinite(Number.parseFloat(String((row as unknown[])[i] ?? "")))
    )
  })

  const { xLabels, yLabels, cells, maxVal } = useMemo(() => {
    const rv = (row: unknown, i: number) => (row as unknown[])[i]
    const xSet = [...new Set(result.rows.map((r) => String(rv(r, xi) ?? "")))]
    const ySet =
      yi >= 0
        ? [...new Set(result.rows.map((r) => String(rv(r, yi) ?? "")))]
        : []
    const safeValIdx = Math.max(0, valIdx)
    const cells = result.rows.flatMap((row) => {
      const x = xSet.indexOf(String(rv(row, xi) ?? ""))
      const y = ySet.indexOf(String(rv(row, yi) ?? ""))
      const v = Number.parseFloat(String(rv(row, safeValIdx) ?? ""))
      return x >= 0 && y >= 0 && Number.isFinite(v) && v > 0
        ? [{ v, x, y }]
        : []
    })
    const maxVal = Math.max(...cells.map((c) => c.v), 1)
    return { cells, maxVal, xLabels: xSet, yLabels: ySet }
  }, [result, xi, yi, valIdx])

  const iw = Math.max(0, width - m.left - m.right)
  const ih = Math.max(0, height - m.top - m.bottom)
  const cw = xLabels.length ? iw / xLabels.length : 0
  const ch = yLabels.length ? ih / yLabels.length : 0

  const cellColor = (v: number) => {
    const t = Math.min(1, v / maxVal)
    return `hsl(221 83% ${Math.round(96 - t * 52)}%)`
  }

  return (
    <div className="h-full w-full" ref={ref}>
      {width > 0 && height > 0 && (
        <svg height={height} width={width}>
          <g transform={`translate(${m.left},${m.top})`}>
            {cells.map((cell, i) => {
              const cx = cell.x * cw + cw / 2
              const cy = cell.y * ch + ch / 2
              return (
                <g key={i}>
                  <rect
                    fill={cellColor(cell.v)}
                    height={Math.max(0, ch - 2)}
                    rx={2}
                    width={Math.max(0, cw - 2)}
                    x={cell.x * cw}
                    y={cell.y * ch}
                  />
                  {cw > 30 && ch > 16 && (
                    <text
                      dominantBaseline="middle"
                      fill="#18181b"
                      fontSize={10}
                      textAnchor="middle"
                      x={cx}
                      y={cy}
                    >
                      {cell.v.toLocaleString()}
                    </text>
                  )}
                </g>
              )
            })}
            {xLabels.map((label, i) => (
              <text
                fill={textColor}
                fontSize={10}
                key={label}
                textAnchor="end"
                transform={`rotate(-30, ${i * cw + cw / 2}, ${ih + 12})`}
                x={i * cw + cw / 2}
                y={ih + 12}
              >
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            ))}
            {yLabels.map((label, i) => (
              <text
                dominantBaseline="middle"
                fill={textColor}
                fontSize={10}
                key={label}
                textAnchor="end"
                x={-6}
                y={i * ch + ch / 2}
              >
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}

// ── PanelChart ────────────────────────────────────────────────────────────────

const STACK_COLORS = [
  "var(--chart-line-primary)",
  "var(--chart-line-secondary)",
  "color-mix(in oklab, var(--chart-line-primary) 78%, white)",
  "color-mix(in oklab, var(--chart-line-secondary) 72%, white)",
  "color-mix(in oklab, var(--chart-line-primary) 62%, white)",
]

function PanelChart({
  chartType,
  result,
  xCol,
  yCol,
  yCols,
}: {
  chartType: ChartType
  result: QueryResult
  xCol: string
  yCol: string
  yCols?: string[]
}) {
  const smallMargin = { bottom: 36, left: 44, right: 16, top: 16 }

  if (chartType === "bar") {
    const isMultiSeries = yCols && yCols.length > 1
    if (isMultiSeries) {
      const data = toStackedBarData(result, xCol, yCols)
      return (
        <BarChart
          animationDuration={600}
          aspectRatio="auto"
          className="h-full"
          data={data}
          margin={{ bottom: 16, left: 100, right: 24, top: 16 }}
          orientation="horizontal"
          stacked
          xDataKey={xCol}
        >
          <Grid horizontal={false} vertical />
          {yCols.map((col, i) => (
            <Bar
              dataKey={col}
              fill={STACK_COLORS[i % STACK_COLORS.length]}
              key={col}
            />
          ))}
          <ChartTooltip showDatePill={false} />
          <BarYAxis />
        </BarChart>
      )
    }
    const data = toBarChartData(result, xCol, yCol)
    return (
      <BarChart
        animationDuration={600}
        aspectRatio="auto"
        className="h-full"
        data={data}
        margin={smallMargin}
        xDataKey={xCol}
      >
        <Grid />
        <Bar dataKey={yCol} />
        <ChartTooltip showDatePill={false} />
        <BarXAxis />
      </BarChart>
    )
  }

  if (chartType === "line" || chartType === "area") {
    const data = toBarChartData(result, xCol, yCol).map((d) => ({
      ...d,
      [xCol]: (() => {
        const parsed = new Date(d[xCol] as string)
        return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
      })(),
    }))
    return (
      <AreaChart
        animationDuration={600}
        aspectRatio="auto"
        className="h-full"
        data={data}
        margin={smallMargin}
        xDataKey={xCol}
      >
        <Grid />
        <Area dataKey={yCol} fillOpacity={chartType === "line" ? 0 : 0.4} />
        <ChartTooltip />
      </AreaChart>
    )
  }

  if (chartType === "pie") {
    const data = toPieData(result, xCol, yCol)
    const total = data.reduce((sum, d) => sum + d.value, 0)
    return (
      <div className="flex h-full items-center gap-6 px-2">
        <div className="aspect-square h-full shrink-0">
          <PieChart
            cornerRadius={4}
            data={data}
            innerRadius={60}
            padAngle={0.02}
          >
            {data.map((_, i) => (
              <PieSlice index={i} key={i} />
            ))}
          </PieChart>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          {data.map((item, i) => {
            const pct =
              total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0"
            return (
              <div
                className="flex items-center gap-2 text-[11px]"
                key={item.label}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: STACK_COLORS[i % STACK_COLORS.length] }}
                />
                <span className="truncate text-foreground/75">
                  {item.label}
                </span>
                <span className="ml-auto shrink-0 pl-3 text-muted-foreground tabular-nums">
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (chartType === "funnel") {
    const data = toFunnelData(result, xCol, yCol)
    return (
      <FunnelChart
        className="h-full"
        data={data}
        orientation="horizontal"
        showPercentage
      />
    )
  }

  if (chartType === "sankey") {
    const data = toSankeyData(result, xCol, yCol)
    return (
      <SankeyChart
        animationDuration={600}
        aspectRatio="auto"
        className="h-full"
        data={data}
        margin={{ bottom: 24, left: 160, right: 160, top: 24 }}
      >
        <SankeyNode />
        <SankeyLink />
        <SankeyTooltip />
      </SankeyChart>
    )
  }

  if (chartType === "heatmap") {
    return <HeatmapChart result={result} xCol={xCol} yCol={yCol} />
  }

  // scatter
  return <ScatterPlot result={result} xCol={xCol} yCol={yCol} />
}

const HEADLINE_CARD_ID = "dashboard-headline"

// ── Default panels ────────────────────────────────────────────────────────────
// Panels are organized as an operational journey system:
// executive value creation, orchestration, and activation operations.

const DEFAULT_PANELS: Panel[] = [
  {
    chartType: "bar",
    description:
      "Quantifies the economic value one company creates for another. This is the executive headline: partner demand, total signal value, and audience quality by source-to-target edge.",
    id: "cross-company-opportunity",
    sql: `SELECT
  source_company || ' → ' || target_company AS opportunity_edge,
  source_company,
  target_company,
  COUNT(*) AS customers,
  ROUND(SUM(signal_value), 0) AS total_signal_value,
  ROUND(AVG(propensity_score), 3) AS avg_propensity
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY 1, 2, 3
ORDER BY total_signal_value DESC`,
    title: "Cross-company Opportunity Generated",
    xCol: "opportunity_edge",
    yCol: "total_signal_value",
  },
  {
    chartType: "sankey",
    description:
      "Shows which cross-company journey transitions create value, not just volume. The flow surfaces the monetization edges inside the journey graph.",
    id: "journey-edge-value",
    sql: `SELECT
  'source:' || source_company AS from_key,
  source_company AS from_label,
  'use_case:' || use_case AS to_key,
  use_case AS to_label,
  ROUND(SUM(signal_value), 0) AS value
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY source_company, use_case
UNION ALL
SELECT
  'use_case:' || use_case AS from_key,
  use_case AS from_label,
  'target:' || target_company AS to_key,
  target_company AS to_label,
  ROUND(SUM(signal_value), 0) AS value
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY use_case, target_company`,
    title: "Journey Edge Value",
    xCol: "from_key",
    yCol: "to_key",
  },
  {
    chartType: "bar",
    description:
      "Replaces simple relationship split with unrealized value. This surfaces where partner demand exists but the destination relationship has not been activated yet.",
    id: "untapped-whitespace",
    sql: `SELECT
  'HDBank → VietJet whitespace' AS whitespace_edge,
  COUNT(*) AS customers,
  ROUND(SUM(travel_spend), 0) AS whitespace_value
FROM partnership.co_brand_silver.customer_360_v1
WHERE has_hdbank_relationship = true
  AND travel_spend > 0
  AND has_vietjetair_relationship = false
UNION ALL
SELECT
  'VietJet → HDBank whitespace' AS whitespace_edge,
  COUNT(*) AS customers,
  ROUND(SUM(gross_booking_value), 0) AS whitespace_value
FROM partnership.co_brand_silver.customer_360_v1
WHERE has_vietjetair_relationship = true
  AND has_hdbank_relationship = false
ORDER BY whitespace_value DESC`,
    title: "Untapped Cross-sell Whitespace",
    xCol: "whitespace_edge",
    yCol: "whitespace_value",
  },
  {
    chartType: "funnel",
    description:
      "Tracks the travel audience from bank relationship to actual activation. Step 3 now correctly nests airline or OTA behavior inside overall travel spend, and the query includes conversion from the first stage.",
    id: "journey-funnel",
    sql: `SELECT
  step_order,
  journey_step,
  customers,
  ROUND(
    customers * 100.0
    / FIRST_VALUE(customers) OVER (ORDER BY step_order),
    2
  ) AS conversion_pct
FROM (
  SELECT 1 AS step_order, 'All HDBank customers' AS journey_step, COUNT(*) AS customers
  FROM hdbank.hdbank_partnership_prod_silver.customers_v1
  UNION ALL
  SELECT 2 AS step_order, 'Travel spenders' AS journey_step, COUNT(*) AS customers
  FROM partnership.co_brand_silver.customer_360_v1
  WHERE has_hdbank_relationship = true
    AND travel_spend > 0
  UNION ALL
  SELECT 3 AS step_order, 'Airline or OTA spenders' AS journey_step, COUNT(*) AS customers
  FROM partnership.co_brand_silver.customer_360_v1
  WHERE has_hdbank_relationship = true
    AND travel_spend > 0
    AND (
      airline_ticket_spend > 0
      OR ota_travel_spend > 0
    )
  UNION ALL
  SELECT 4 AS step_order, 'No VietJet relationship yet' AS journey_step, COUNT(*) AS customers
  FROM partnership.co_brand_silver.customer_360_v1
  WHERE has_hdbank_relationship = true
    AND travel_spend > 0
    AND has_vietjetair_relationship = false
  UNION ALL
  SELECT 5 AS step_order, 'Activation candidates' AS journey_step, COUNT(*) AS customers
  FROM hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1
) funnel
ORDER BY step_order`,
    title: "Journey Funnel - HDBank Travel Customers to VietJet Activation",
    xCol: "journey_step",
    yCol: "customers",
  },
  {
    chartType: "bar",
    description:
      "Keeps the prioritization view, but adds the economic lens behind the thresholds. Prime Targets are high-readiness and high-flyer customers; the other bands reveal where the next-best activation should start.",
    id: "activation-segments",
    sql: `SELECT
  CASE
    WHEN cross_sell_readiness_score >= 0.6 AND frequent_flyer_score >= 0.6 THEN 'Prime Targets'
    WHEN cross_sell_readiness_score >= 0.6 THEN 'HDBank-led'
    WHEN frequent_flyer_score >= 0.6 THEN 'VietJet-led'
    ELSE 'Nurture'
  END AS segment,
  COUNT(*) AS customers,
  ROUND(AVG(travel_spend), 0) AS avg_travel_spend,
  ROUND(AVG(gross_booking_value), 0) AS avg_booking_value,
  ROUND(AVG(monthly_income), 0) AS avg_monthly_income
FROM partnership.co_brand_silver.customer_360_v1
WHERE has_hdbank_relationship = true
   OR has_vietjetair_relationship = true
GROUP BY segment
ORDER BY customers DESC`,
    title: "Activation Segments",
    xCol: "segment",
    yCol: "customers",
  },
  {
    chartType: "sankey",
    description:
      "Demonstrates orchestration rather than reporting. It maps each use case into the recommended offer and channel so the journey engine answers what should happen next.",
    id: "next-best-journey",
    sql: `SELECT
  'use_case:' || use_case AS from_key,
  use_case AS from_label,
  'offer:' || offer_name AS to_key,
  offer_name AS to_label,
  COUNT(*) AS customers
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY use_case, offer_name
UNION ALL
SELECT
  'offer:' || offer_name AS from_key,
  offer_name AS from_label,
  'channel:' || recommended_channel AS to_key,
  recommended_channel AS to_label,
  COUNT(*) AS customers
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY offer_name, recommended_channel`,
    title: "Next Best Journey",
    xCol: "from_key",
    yCol: "to_key",
  },
  {
    chartType: "sankey",
    description:
      "Operational lineage from source signal to execution path. The routing uses explicit from/to nodes and adds signal value so campaign activation can be evaluated as a production flow.",
    id: "offer-routing",
    sql: `SELECT
  'source:' || source_company AS from_key,
  source_company AS from_label,
  'use_case:' || use_case AS to_key,
  use_case AS to_label,
  ROUND(SUM(signal_value), 0) AS signal_value
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY source_company, use_case
UNION ALL
SELECT
  'use_case:' || use_case AS from_key,
  use_case AS from_label,
  'channel:' || recommended_channel AS to_key,
  recommended_channel AS to_label,
  ROUND(SUM(signal_value), 0) AS signal_value
FROM partnership.co_brand_gold.co_brand_offer_audience_v1
GROUP BY use_case, recommended_channel`,
    title: "Offer Routing",
    xCol: "from_key",
    yCol: "to_key",
  },
  {
    chartType: "bar",
    description:
      "Prioritizes recovery by pain and value rather than raw volume. High-value customers with poor service experiences create economic risk, so bands are sorted by recovery score instead of customer count.",
    id: "recovery-risk",
    sql: `SELECT
  vietjet_priority_band,
  COUNT(*) AS customers,
  ROUND(SUM(gross_booking_value), 0) AS revenue_at_risk,
  ROUND(AVG(service_recovery_score), 3) AS recovery_score,
  ROUND(AVG(avg_delay_minutes), 1) AS avg_delay_minutes,
  ROUND(AVG(incident_count), 2) AS avg_incident_count
FROM partnership.co_brand_silver.customer_360_v1
WHERE incident_count > 0
GROUP BY vietjet_priority_band
ORDER BY recovery_score DESC`,
    title: "Recovery Risk to Revenue",
    xCol: "vietjet_priority_band",
    yCol: "revenue_at_risk",
  },
]

const DEFAULT_LAYOUT: Layout = [
  { h: 5, i: HEADLINE_CARD_ID, w: 2, x: 0, y: 0 },
  { h: 6, i: "cross-company-opportunity", w: 1, x: 0, y: 5 },
  { h: 6, i: "untapped-whitespace", w: 1, x: 1, y: 5 },
  { h: 9, i: "journey-edge-value", w: 2, x: 0, y: 11 },
  { h: 7, i: "journey-funnel", w: 2, x: 0, y: 20 },
  { h: 7, i: "activation-segments", w: 1, x: 0, y: 27 },
  { h: 7, i: "recovery-risk", w: 1, x: 1, y: 27 },
  { h: 9, i: "next-best-journey", w: 2, x: 0, y: 34 },
  { h: 9, i: "offer-routing", w: 2, x: 0, y: 43 },
]

// ── PreviewGrid ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function PreviewGrid({ result }: { result: QueryResult }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(200)

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
      result.rows.map((row) =>
        Object.fromEntries(
          result.columns.map((col, i) => [col, (row as unknown[])[i]])
        )
      ),
    [result]
  )
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      result.columns.map((col) => ({
        accessorKey: col,
        header: col,
        id: col,
        meta: { cell: { variant: "short-text" as const } },
        size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
      })),
    [result]
  )
  const { table, ...gridProps } = useDataGrid<Row>({
    columns,
    data,
    readOnly: true,
  })
  return (
    <div className="h-full overflow-hidden" ref={containerRef}>
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
  onConfigure,
  onDelete,
}: {
  panel: Panel
  data: PanelData
  editing: boolean
  selected: boolean
  onClick: () => void
  onConfigure: () => void
  onDelete: () => void
}) {
  const canRenderChart =
    data.status === "ok" && !!data.result && !!panel.xCol && !!panel.yCol

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-all",
        selected && "border-primary ring-2 ring-primary",
        editing && !selected && "border-dashed"
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "panel-drag-handle flex shrink-0 select-none items-center gap-1.5 border-b bg-muted/20 px-3 py-2",
          editing && "cursor-grab active:cursor-grabbing"
        )}
      >
        {editing && (
          <IconGripVertical
            className="shrink-0 text-muted-foreground"
            size={12}
          />
        )}
        <span className="flex-1 truncate font-medium text-xs">
          {panel.title}
        </span>
        {data.status === "running" && (
          <IconLoader2
            className="shrink-0 animate-spin text-muted-foreground"
            size={12}
          />
        )}
        {data.status === "error" && (
          <IconAlertCircle className="shrink-0 text-destructive" size={12} />
        )}
        {data.status === "ok" && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {data.result?.row_count} rows
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
              type="button"
            >
              <IconDotsVertical size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onConfigure()
              }}
            >
              <IconPencil className="mr-2" size={12} />
              Configure
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <IconTrash className="mr-2" size={12} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 p-1">
        {data.status === "idle" && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <IconChartHistogram size={22} />
            <p className="text-[11px]">Use menu to configure</p>
          </div>
        )}
        {data.status === "running" && <Skeleton className="h-full w-full" />}
        {data.status === "error" && (
          <div className="flex h-full items-center justify-center p-3">
            <p className="whitespace-pre-wrap text-center text-[11px] text-destructive">
              {data.error}
            </p>
          </div>
        )}
        {canRenderChart && data.result && (
          <PanelChart
            chartType={panel.chartType}
            result={data.result}
            xCol={panel.xCol}
            yCol={panel.yCol}
            yCols={panel.yCols}
          />
        )}
        {data.status === "ok" && !canRenderChart && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <IconCheck size={22} />
            <p className="text-[11px]">
              {data.result?.row_count} rows — configure X/Y columns
            </p>
          </div>
        )}
      </div>
      {panel.description && (
        <p className="max-h-[5rem] min-h-[2.5rem] shrink-0 overflow-y-auto border-t px-3 py-2 text-muted-foreground text-xs leading-relaxed">
          {panel.description}
        </p>
      )}
    </div>
  )
}

function HeadlineCard({
  editing,
  metrics,
}: {
  editing: boolean
  metrics: Array<{ title: string; value: string; detail: string }>
}) {
  return (
    <div className="h-full overflow-hidden rounded-lg border bg-card">
      <div
        className={cn(
          "panel-drag-handle flex select-none items-center gap-1.5 border-b bg-muted/20 px-3 py-2",
          editing && "cursor-grab active:cursor-grabbing"
        )}
      >
        {editing && (
          <IconGripVertical
            className="shrink-0 text-muted-foreground"
            size={12}
          />
        )}
        <span className="font-medium text-xs">Headline</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Badge variant="outline">Journey engine</Badge>
          <Badge variant="outline">Activation platform</Badge>
        </div>
      </div>
      <div className="grid h-[calc(100%-37px)] gap-4 p-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex min-w-0 flex-col justify-between gap-3">
          <div className="space-y-2">
            <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.24em]">
              Cross-company lakehouse
            </p>
            <h1 className="max-w-2xl font-semibold text-lg tracking-tight">
              Customer signals become partner revenue.
            </h1>
          </div>
          <p className="max-w-2xl text-muted-foreground text-xs leading-5">
            Track opportunity created across companies, the journey edges that
            convert, and the routing needed to operationalize those signals.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div
              className="rounded-xl border bg-background/70 p-3"
              key={metric.title}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                {metric.title}
              </p>
              <p className="mt-1 font-semibold text-lg tracking-tight">
                {metric.value}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground leading-4">
                {metric.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Chart type config ─────────────────────────────────────────────────────────

const CHART_TYPE_CONFIG: Record<
  ChartType,
  { label: string; icon: TablerIcon }
> = {
  area: { icon: IconChartArea, label: "Area" },
  bar: { icon: IconChartHistogram, label: "Bar" },
  funnel: { icon: IconChartDots, label: "Funnel" },
  heatmap: { icon: IconChartDots, label: "Heatmap" },
  line: { icon: IconChartBar, label: "Line" },
  pie: { icon: IconChartPie, label: "Pie / Donut" },
  sankey: { icon: IconChartSankey, label: "Sankey / Flow" },
  scatter: { icon: IconChartScatter, label: "Scatter" },
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
    <div className="flex h-full flex-col text-xs">
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Panel
        </p>
        <Input
          className="h-7 text-xs"
          onChange={(e) => onChange({ ...panel, title: e.target.value })}
          placeholder="Panel title"
          value={panel.title}
        />
        <Textarea
          className="min-h-24 text-xs"
          onChange={(e) => onChange({ ...panel, description: e.target.value })}
          placeholder="Description (shown below the chart)"
          rows={4}
          value={panel.description ?? ""}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-widest">
            SQL Query
          </Label>
          <Button
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={isRunning || !panel.sql.trim()}
            onClick={() => onRun(panel)}
            size="sm"
          >
            {isRunning ? (
              <IconLoader2 className="animate-spin" size={11} />
            ) : (
              <IconPlayerPlay size={11} />
            )}
            Run
          </Button>
        </div>
        <div
          className="min-h-[160px] overflow-hidden rounded-md border bg-background"
          id={`${uid}-sql`}
        >
          <SqlCodeEditor
            className="h-full"
            editorClassName="min-h-[160px]"
            lineNumbers="off"
            onChange={(value) => onChange({ ...panel, sql: value })}
            onSubmit={() => {
              if (!isRunning && panel.sql.trim()) {
                onRun(panel)
              }
            }}
            value={panel.sql}
          />
        </div>
        {data.status === "error" && (
          <p className="whitespace-pre-wrap text-[10px] text-destructive">
            {data.error}
          </p>
        )}
        {data.status === "ok" && (
          <p className="text-[10px] text-muted-foreground">
            {data.result?.row_count} rows returned
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-3 px-4 py-3">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Visualization
        </Label>
        <div className="grid gap-1.5">
          <Label
            className="text-muted-foreground text-xs"
            htmlFor={`${uid}-type`}
          >
            Chart Type
          </Label>
          <Select
            onValueChange={(v) =>
              onChange({ ...panel, chartType: v as ChartType })
            }
            value={panel.chartType}
          >
            <SelectTrigger className="h-7 w-full text-xs" id={`${uid}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHART_TYPE_CONFIG) as ChartType[]).map((type) => {
                const ChartTypeIcon = CHART_TYPE_CONFIG[type].icon
                return (
                  <SelectItem
                    key={type}
                    textValue={CHART_TYPE_CONFIG[type].label}
                    value={type}
                  >
                    <div className="flex items-center gap-1.5">
                      <ChartTypeIcon className="shrink-0" size={12} />
                      {CHART_TYPE_CONFIG[type].label}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label
            className="text-muted-foreground text-xs"
            htmlFor={`${uid}-xcol`}
          >
            X Column
          </Label>
          {columns.length > 0 ? (
            <Select
              onValueChange={(v) => onChange({ ...panel, xCol: v })}
              value={panel.xCol}
            >
              <SelectTrigger className="h-7 w-full text-xs" id={`${uid}-xcol`}>
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
              className="h-7 w-full font-mono text-xs"
              id={`${uid}-xcol`}
              onChange={(e) => onChange({ ...panel, xCol: e.target.value })}
              placeholder="column name"
              value={panel.xCol}
            />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label
            className="text-muted-foreground text-xs"
            htmlFor={`${uid}-ycol`}
          >
            Y Column
          </Label>
          {columns.length > 0 ? (
            <Select
              onValueChange={(v) => onChange({ ...panel, yCol: v })}
              value={panel.yCol}
            >
              <SelectTrigger className="h-7 w-full text-xs" id={`${uid}-ycol`}>
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
              className="h-7 w-full font-mono text-xs"
              id={`${uid}-ycol`}
              onChange={(e) => onChange({ ...panel, yCol: e.target.value })}
              placeholder="column name"
              value={panel.yCol}
            />
          )}
        </div>
      </div>
      {data.status === "ok" && data.result && (
        <>
          <Separator />
          <div className="shrink-0 px-4 pt-3 pb-1">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest">
              Preview
            </Label>
          </div>
          <div className="min-h-0 flex-1">
            <PreviewGrid result={data.result} />
          </div>
        </>
      )}
    </div>
  )
}

// ── AI Composer (left sidebar) ────────────────────────────────────────────────

const SUGGESTIONS = [
  "Show which partner generates the most signal value for the other",
  "Compare journey edges by monetization value and customer volume",
  "Find untapped whitespace where travel spend exists without VietJet adoption",
  "Build a next-best-journey view from use case to offer to channel",
  "Prioritize recovery bands by revenue at risk and recovery score",
]

const PANEL_MENTION_RE = /@\[(.*?)\]\(panel:([^)]+)\)/g

function extractMentionedPanelIds(text: string) {
  const ids: string[] = []
  for (const match of text.matchAll(PANEL_MENTION_RE)) {
    const id = match[2]
    if (id && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids
}

function stripPanelMentionMarkup(text: string) {
  return text.replace(PANEL_MENTION_RE, (_, label: string) => `@${label}`)
}

function getActiveMention(text: string, caret: number) {
  const uptoCaret = text.slice(0, caret)
  const at = uptoCaret.lastIndexOf("@")
  if (at === -1) {
    return null
  }

  const fragment = uptoCaret.slice(at)
  if (fragment.startsWith("@[")) {
    return null
  }
  if (fragment.includes("\n")) {
    return null
  }
  if (/\s/.test(fragment.slice(1))) {
    return null
  }

  return {
    end: caret,
    query: fragment.slice(1),
    start: at,
  }
}

function AiComposer({
  sessionId,
  modelId,
  panels,
  panelData,
  selectedPanelIds,
  onRemoveSelectedPanel,
  onClearSelectedPanels,
  onModelChange,
  onPanelsCreated,
  onPanelsEdited,
}: {
  sessionId: string | null
  modelId: ModelId
  panels: Panel[]
  panelData: Record<string, PanelData>
  selectedPanelIds: string[]
  onRemoveSelectedPanel: (id: string) => void
  onClearSelectedPanels: () => void
  onModelChange: (m: ModelId) => void
  onPanelsCreated: (
    panels: Panel[],
    results: Record<string, QueryResult>
  ) => void
  onPanelsEdited: (
    updates: Array<{ panel: Panel; result: QueryResult }>
  ) => void
}) {
  const [input, setInput] = useState("")
  const [caretPos, setCaretPos] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef(sessionId)
  const modelIdRef = useRef(modelId)
  const panelsRef = useRef(panels)
  const panelDataRef = useRef(panelData)
  const selectedPanelIdsRef = useRef(selectedPanelIds)
  const mentionedPanelIdsRef = useRef<string[]>([])
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
    panelDataRef.current = panelData
  }, [panelData])
  useEffect(() => {
    selectedPanelIdsRef.current = selectedPanelIds
  }, [selectedPanelIds])
  useEffect(() => {
    onPanelsCreatedRef.current = onPanelsCreated
  }, [onPanelsCreated])
  useEffect(() => {
    onPanelsEditedRef.current = onPanelsEdited
  }, [onPanelsEdited])

  const activeMention = useMemo(
    () => getActiveMention(input, caretPos),
    [input, caretPos]
  )
  const selectedPanels = useMemo(
    () =>
      selectedPanelIds
        .map((id) => panels.find((panel) => panel.id === id) ?? null)
        .filter((panel): panel is Panel => !!panel),
    [panels, selectedPanelIds]
  )

  const mentionPanels = useMemo(() => {
    if (!activeMention) {
      return []
    }
    const query = activeMention.query.trim().toLowerCase()
    return panels.filter((panel) => {
      if (!query) {
        return true
      }
      return (
        panel.title.toLowerCase().includes(query) ||
        (panel.description ?? "").toLowerCase().includes(query)
      )
    })
  }, [activeMention, panels])

  useEffect(() => {
    setMentionIndex(0)
  }, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/dashboard/generate",
        body: () => ({
          lastCreatedIds: lastCreatedIdsRef.current,
          mentionedPanelIds: mentionedPanelIdsRef.current,
          modelId: modelIdRef.current,
          panels: panelsRef.current.map<PanelSummary>((p) => ({
            chartType: p.chartType,
            description: p.description,
            id: p.id,
            resultPreview:
              panelDataRef.current[p.id]?.status === "ok" &&
              panelDataRef.current[p.id]?.result
                ? {
                    columns: panelDataRef.current[p.id]?.result?.columns ?? [],
                    rowCount:
                      panelDataRef.current[p.id]?.result?.row_count ?? 0,
                    rows:
                      panelDataRef.current[p.id]?.result?.rows.slice(0, 10) ??
                      [],
                  }
                : undefined,
            sql: p.sql,
            title: p.title,
            xCol: p.xCol,
            yCol: p.yCol,
          })),
          selectedPanelId: selectedPanelIdsRef.current.at(-1) ?? null,
          selectedPanelIds: selectedPanelIdsRef.current,
          sessionId: sessionIdRef.current,
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
    [fetchSessions, setActiveId]
  )

  const { messages, sendMessage, status } = useChat({ transport })
  const isLoading = status === "submitted" || status === "streaming"

  // When tool calls land, apply creates and edits to the dashboard
  useEffect(() => {
    const last = messages.at(-1)
    if (last?.role !== "assistant") {
      return
    }

    const newPanels: Panel[] = []
    const newResults: Record<string, QueryResult> = {}
    const editedUpdates: Array<{ panel: Panel; result: QueryResult }> = []

    for (const part of last.parts) {
      if (!isToolUIPart(part)) {
        continue
      }
      if (part.state !== "output-available") {
        continue
      }

      const toolName = getToolName(part)

      if (toolName === "createPanel") {
        const out = part.output as CreatePanelOutput
        if (out.error || !out.columns || !out.rows) {
          continue
        }
        const id = `ai-${part.toolCallId}`
        newPanels.push({
          chartType: out.chartType,
          id,
          sql: out.sql,
          title: out.title,
          xCol: out.xCol,
          yCol: out.yCol,
        })
        newResults[id] = {
          columns: out.columns,
          row_count: out.row_count ?? out.rows.length,
          rows: out.rows,
        }
      }

      if (toolName === "editPanel") {
        const out = part.output as EditPanelOutput
        if (out.error || !out.columns || !out.rows) {
          continue
        }
        editedUpdates.push({
          panel: {
            chartType: out.chartType,
            id: out.panelId,
            sql: out.sql,
            title: out.title,
            xCol: out.xCol,
            yCol: out.yCol,
          },
          result: {
            columns: out.columns,
            row_count: out.row_count ?? out.rows.length,
            rows: out.rows,
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
  }, [])

  const insertPanelMention = useCallback(
    (panel: Panel) => {
      if (!activeMention) {
        return
      }
      const token = `@[${panel.title}](panel:${panel.id}) `
      const next =
        input.slice(0, activeMention.start) + token + input.slice(caretPos)
      const nextCaret = activeMention.start + token.length
      setInput(next)
      setCaretPos(nextCaret)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
      })
    },
    [activeMention, caretPos, input]
  )

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) {
      return
    }
    mentionedPanelIdsRef.current = extractMentionedPanelIds(text)
    setInput("")
    setCaretPos(0)
    sendMessage({ text: stripPanelMentionMarkup(text) })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (activeMention && mentionPanels.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionIndex((idx) => (idx + 1) % mentionPanels.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionIndex(
          (idx) => (idx - 1 + mentionPanels.length) % mentionPanels.length
        )
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const candidate = mentionPanels[mentionIndex] ?? mentionPanels[0]
        if (candidate) {
          insertPanelMention(candidate)
        }
        return
      }
    }
    if (activeMention && e.key === "Escape") {
      e.preventDefault()
      setCaretPos(activeMention.start)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(
          activeMention.start,
          activeMention.start
        )
      })
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2 p-3">
            <p className="text-muted-foreground text-xs">
              Ask about your data or what an existing panel means.
            </p>
            <div className="mt-1 flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  className="rounded border px-2.5 py-1.5 text-left text-foreground/80 text-xs transition-colors hover:bg-accent"
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
          <div className="space-y-0.5 py-2">
            {messages.map((msg) => (
              <ComposerMessage
                isAnimating={isLoading && msg === messages.at(-1)}
                key={msg.id}
                message={msg}
              />
            ))}
            {isLoading && messages.at(-1)?.role === "user" && (
              <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs">
                <IconLoader2 className="animate-spin" size={12} />
                Generating panels…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex min-w-0 shrink-0 flex-col gap-2 overflow-x-hidden border-t p-2.5">
        {selectedPanels.length > 0 ? (
          <div className="flex min-w-0 items-stretch gap-2">
            <button
              aria-label="Clear selected panels"
              className="flex shrink-0 items-center justify-center self-stretch rounded-md border bg-background px-2 text-muted-foreground hover:text-foreground"
              onClick={onClearSelectedPanels}
              title="Clear selected panels"
              type="button"
            >
              <IconX size={12} />
            </button>
            <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap">
              {selectedPanels.map((panel) => (
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] text-foreground/85 hover:bg-accent"
                  key={panel.id}
                  onClick={() => onRemoveSelectedPanel(panel.id)}
                  title={panel.title}
                  type="button"
                >
                  <span>{panel.title}</span>
                  <IconX className="shrink-0 text-muted-foreground" size={10} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Popover open={!!activeMention}>
          <PopoverAnchor asChild>
            <InputGroup className="min-h-[132px] min-w-0 items-stretch overflow-x-hidden rounded-xl bg-background">
              <InputGroupTextarea
                className="min-h-[84px] w-full max-w-full overflow-x-hidden px-3 pt-3 text-xs [field-sizing:fixed]"
                onChange={(e) => {
                  setInput(e.target.value)
                  setCaretPos(e.target.selectionStart ?? e.target.value.length)
                }}
                onClick={(e) =>
                  setCaretPos(e.currentTarget.selectionStart ?? 0)
                }
                onKeyDown={handleKeyDown}
                onSelect={(e) =>
                  setCaretPos(e.currentTarget.selectionStart ?? 0)
                }
                placeholder="Ask about revenue, trends, customers… Use @ to mention a panel."
                ref={textareaRef}
                rows={3}
                value={input}
              />
              <InputGroupAddon
                align="block-end"
                className="items-center justify-between gap-2 border-t px-3 py-2"
              >
                <div className="flex w-full items-center gap-2">
                  <div className="w-full flex-1">
                    <Select
                      onValueChange={(v) => onModelChange(v as ModelId)}
                      value={modelId}
                    >
                      <SelectTrigger className="h-7 w-full bg-transparent px-1 text-xs shadow-none">
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
                  </div>
                  <Button
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    disabled={!input.trim() || isLoading}
                    onClick={handleSend}
                    size="sm"
                  >
                    {isLoading ? (
                      <IconLoader2 className="animate-spin" size={12} />
                    ) : (
                      <IconSend2 size={12} />
                    )}
                    Generate
                  </Button>
                </div>
              </InputGroupAddon>
            </InputGroup>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="w-[320px] p-1.5"
            onOpenAutoFocus={(e) => e.preventDefault()}
            side="top"
          >
            <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-widest">
              Mention Panel
            </div>
            <div className="max-h-56 overflow-y-auto">
              {mentionPanels.length > 0 ? (
                mentionPanels.map((panel, idx) => (
                  <button
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      idx === mentionIndex
                        ? "bg-muted text-foreground"
                        : "text-foreground/85 hover:bg-muted/70"
                    )}
                    key={panel.id}
                    onClick={() => insertPanelMention(panel)}
                    onMouseDown={(e) => e.preventDefault()}
                    type="button"
                  >
                    <span className="font-medium">{panel.title}</span>
                    {panel.description ? (
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">
                        {panel.description}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="px-2 py-3 text-muted-foreground text-xs">
                  No matching panels
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
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
      <div className="flex justify-end px-3 py-1.5">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-primary px-3 py-1.5 text-primary-foreground text-xs">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-1.5">
      <div className="space-y-1">
        {message.parts.map((part, i) => (
          <ComposerMessagePart isAnimating={isAnimating} key={i} part={part} />
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
    if (!part.text.trim()) {
      return null
    }
    return (
      <Streamdown
        animated
        className="text-xs leading-relaxed"
        isAnimating={isAnimating}
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
          <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground text-xs">
            <IconLoader2 className="shrink-0 animate-spin" size={11} />
            {inp?.title ? `Creating: ${inp.title}` : "Creating panel…"}
          </div>
        )
      }
      if (part.state === "output-available") {
        const out = part.output as CreatePanelOutput
        if (out.error) {
          return (
            <div className="py-0.5 text-destructive text-xs">
              Failed to create "{out.title}": {out.error}
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground text-xs">
            <IconChartDots className="shrink-0 text-primary" size={11} />
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
          <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground text-xs">
            <IconLoader2 className="shrink-0 animate-spin" size={11} />
            {inp?.title ? `Editing: ${inp.title}` : "Editing panel…"}
          </div>
        )
      }
      if (part.state === "output-available") {
        const out = part.output as EditPanelOutput
        if (out.error) {
          return (
            <div className="py-0.5 text-destructive text-xs">
              Failed to edit "{out.title}": {out.error}
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground text-xs">
            <IconPencil className="shrink-0 text-primary" size={11} />
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
        { error: null, result: null, status: "idle" },
      ])
    )
  )
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [configPanelId, setConfigPanelId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [composerWidth, setComposerWidth] = useState(COMPOSER_DEFAULT)
  const [modelId, setModelId] = useState<ModelId>("gpt-5.4-nano")
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const composerDragRef = useRef<{ startX: number; startW: number } | null>(
    null
  )
  const abortRefs = useRef<Record<string, AbortController>>({})

  const { activeId } = useSessionContext()

  const runQuery = useCallback(async (panel: Panel) => {
    if (!panel.sql.trim()) {
      return
    }
    abortRefs.current[panel.id]?.abort()
    const ctrl = new AbortController()
    abortRefs.current[panel.id] = ctrl
    setPanelData((prev) => ({
      ...prev,
      [panel.id]: { error: null, result: null, status: "running" },
    }))
    try {
      const idToken = await getToken()
      const res = await apiFetch("/api/sessions/default/query", {
        body: JSON.stringify({ idToken, sql: panel.sql }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: ctrl.signal,
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`)
      }
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { error: null, result: json, status: "ok" },
      }))
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return
      }
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: {
          error: (err as Error).message,
          result: null,
          status: "error",
        },
      }))
    }
  }, [])

  const hasAutoRun = useRef(false)
  useEffect(() => {
    if (hasAutoRun.current) {
      return
    }
    hasAutoRun.current = true
    for (const panel of panels) {
      if (panel.sql.trim()) {
        runQuery(panel)
      }
    }
    // panels intentionally excluded — only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runQuery, panels])

  const handlePanelChange = useCallback((updated: Panel) => {
    setPanels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }, [])

  const handleAddPanel = () => {
    const id = `p${Date.now()}`
    const panel: Panel = {
      chartType: "bar",
      id,
      sql: "",
      title: "New Panel",
      xCol: "",
      yCol: "",
    }
    setPanels((prev) => [...prev, panel])
    setPanelData((prev) => ({
      ...prev,
      [id]: { error: null, result: null, status: "idle" },
    }))
    setLayout((prev) => [
      ...prev,
      { h: 4, i: id, w: 1, x: 0, y: Number.POSITIVE_INFINITY } as LayoutItem,
    ])
    setSelectedIds([id])
    setConfigPanelId(id)
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
    setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id))
    if (configPanelId === id) {
      setConfigPanelId(null)
    }
  }

  // Called by AiComposer when editPanel tool calls complete
  const handlePanelsEdited = useCallback(
    (updates: Array<{ panel: Panel; result: QueryResult }>) => {
      setPanels((prev) =>
        prev.map((p) => {
          const upd = updates.find((u) => u.panel.id === p.id)
          return upd ? upd.panel : p
        })
      )
      setPanelData((prev) => {
        const next = { ...prev }
        for (const { panel, result } of updates) {
          next[panel.id] = { error: null, result, status: "ok" }
        }
        return next
      })
    },
    []
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
            updates[id] = { error: null, result, status: "ok" }
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
                h: 4,
                i: p.id,
                w: 1,
                x: i % 2,
                y: Number.POSITIVE_INFINITY,
              }) as LayoutItem
          )
        return [...prev, ...newItems]
      })
    },
    []
  )

  const refreshAll = () => {
    for (const panel of panels) {
      if (panel.sql.trim()) {
        runQuery(panel)
      }
    }
  }

  // Resize handlers
  const makeDragHandler =
    (
      dragRef: typeof sidebarDragRef,
      setWidth: (w: number) => void,
      min: number,
      max: number,
      direction: "left" | "right"
    ) =>
    (e: ReactMouseEvent) => {
      e.preventDefault()
      dragRef.current = {
        startW: direction === "left" ? composerWidth : sidebarWidth,
        startX: e.clientX,
      }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) {
          return
        }
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

  const configPanel = panels.find((p) => p.id === configPanelId) ?? null
  const configPanelData = configPanelId
    ? (panelData[configPanelId] ?? {
        error: null,
        result: null,
        status: "idle",
      })
    : null
  const heroMetrics = useMemo(() => {
    const opportunityRows = resultToRows(
      panelData["cross-company-opportunity"]?.result ?? null
    )
    const whitespaceRows = resultToRows(
      panelData["untapped-whitespace"]?.result ?? null
    )
    const recoveryRows = resultToRows(
      panelData["recovery-risk"]?.result ?? null
    )

    const topOpportunity = opportunityRows[0]
    const topWhitespace = whitespaceRows[0]
    const topRecovery = recoveryRows[0]
    const whitespaceValue = whitespaceRows.reduce((sum, row) => {
      const value = getNumberValue(row, "whitespace_value")
      return sum + (value ?? 0)
    }, 0)

    return [
      {
        detail:
          topOpportunity === null
            ? "Waiting for query"
            : `${getTextValue(topOpportunity, "source_company")} → ${getTextValue(topOpportunity, "target_company")} from ${formatCompactNumber(getNumberValue(topOpportunity, "customers"))} customers`,
        title: "Opportunity generated",
        value: formatCompactNumber(
          getNumberValue(topOpportunity, "total_signal_value"),
          " VND"
        ),
      },
      {
        detail:
          topWhitespace === null
            ? "Waiting for query"
            : `${getTextValue(topWhitespace, "whitespace_edge")} is the largest open pool`,
        title: "Untapped whitespace",
        value: formatCompactNumber(whitespaceValue, " VND"),
      },
      {
        detail:
          topRecovery === null
            ? "Waiting for query"
            : `${getTextValue(topRecovery, "vietjet_priority_band")} band recovery score ${getNumberValue(topRecovery, "recovery_score") ?? "n/a"}`,
        title: "Revenue at risk",
        value: formatCompactNumber(
          getNumberValue(topRecovery, "revenue_at_risk"),
          " VND"
        ),
      },
    ]
  }, [panelData])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Full-width toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm">
            Cross-company journey dashboard
          </p>
          <p className="text-muted-foreground text-xs">
            Journey engine, activation platform, and operational lakehouse
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            className="h-7 gap-1.5 text-xs"
            onClick={refreshAll}
            size="sm"
            title="Re-run all panels"
            variant="ghost"
          >
            <IconRefresh size={13} />
          </Button>
          <Button
            className="h-7 gap-1.5 text-xs"
            onClick={handleAddPanel}
            size="sm"
            variant="ghost"
          >
            <IconPlus size={13} />
            Add Panel
          </Button>
          <Button
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setEditing((v) => !v)
              if (editing) {
                setSelectedIds([])
              }
            }}
            size="sm"
            variant={editing ? "default" : "outline"}
          >
            {editing ? (
              <>
                <IconX size={13} />
                Done
              </>
            ) : (
              <>
                <IconChartDots size={13} />
                Edit Layout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: AI Composer */}
        <div className="flex h-full shrink-0" style={{ width: composerWidth }}>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r bg-background">
            <AiComposer
              modelId={modelId}
              onClearSelectedPanels={() => setSelectedIds([])}
              onModelChange={setModelId}
              onPanelsCreated={handlePanelsCreated}
              onPanelsEdited={handlePanelsEdited}
              onRemoveSelectedPanel={(id) =>
                setSelectedIds((prev) =>
                  prev.filter((selectedId) => selectedId !== id)
                )
              }
              panelData={panelData}
              panels={panels}
              selectedPanelIds={selectedIds}
              sessionId={activeId}
            />
          </div>
          {/* Composer resize handle (right edge) */}
          <div
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40 active:bg-primary/60"
            onMouseDown={makeDragHandler(
              composerDragRef,
              setComposerWidth,
              COMPOSER_MIN,
              COMPOSER_MAX,
              "left"
            )}
          />
        </div>

        {/* Center: Grid */}
        <div
          className="min-w-0 flex-1 overflow-auto p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedIds([])
            }
          }}
          ref={containerRef}
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 pb-4">
            {panels.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
                <IconSparkles className="opacity-20" size={36} />
                <p className="text-sm">
                  Ask the AI composer to generate panels, or click{" "}
                  <strong>Add Panel</strong>.
                </p>
              </div>
            ) : mounted ? (
              <ReactGridLayout
                dragConfig={{ enabled: editing, handle: ".panel-drag-handle" }}
                gridConfig={{ cols: 2, margin: [8, 8], rowHeight: 60 }}
                layout={layout}
                onLayoutChange={setLayout}
                resizeConfig={{ enabled: editing, handles: ["se"] }}
                width={width}
              >
                <div key={HEADLINE_CARD_ID}>
                  <HeadlineCard editing={editing} metrics={heroMetrics} />
                </div>
                {panels.map((panel) => (
                  <div key={panel.id}>
                    <PanelCard
                      data={
                        panelData[panel.id] ?? {
                          error: null,
                          result: null,
                          status: "idle",
                        }
                      }
                      editing={editing}
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.includes(panel.id)
                            ? prev.filter((id) => id !== panel.id)
                            : [...prev, panel.id]
                        )
                      }
                      onConfigure={() => {
                        setSelectedIds((prev) =>
                          prev.includes(panel.id) ? prev : [...prev, panel.id]
                        )
                        setConfigPanelId(panel.id)
                      }}
                      onDelete={() => handleDeletePanel(panel.id)}
                      panel={panel}
                      selected={selectedIds.includes(panel.id)}
                    />
                  </div>
                ))}
              </ReactGridLayout>
            ) : null}
          </div>
        </div>

        {/* Right: Panel config sidebar */}
        {configPanel && configPanelData && (
          <div className="flex h-full shrink-0" style={{ width: sidebarWidth }}>
            <div
              className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40 active:bg-primary/60"
              onMouseDown={makeDragHandler(
                sidebarDragRef,
                setSidebarWidth,
                SIDEBAR_MIN,
                SIDEBAR_MAX,
                "right"
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-auto border-l bg-background">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
                <span className="font-semibold text-xs">Panel Config</span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setConfigPanelId(null)}
                  type="button"
                >
                  <IconX size={13} />
                </button>
              </div>
              <PanelSidebar
                data={configPanelData}
                onChange={handlePanelChange}
                onRun={runQuery}
                panel={configPanel}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
