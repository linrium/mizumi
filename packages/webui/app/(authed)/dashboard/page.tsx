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
import useMeasure from "react-use-measure"
import { BarChart } from "@/components/charts/bar-chart"
import { Bar } from "@/components/charts/bar"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { AreaChart, Area } from "@/components/charts/area-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { PieSlice } from "@/components/charts/pie-slice"
import { FunnelChart } from "@/components/charts/funnel-chart"
import { SankeyChart } from "@/components/charts/sankey/sankey-chart"
import { SankeyNode } from "@/components/charts/sankey/sankey-node"
import { SankeyLink } from "@/components/charts/sankey/sankey-link"
import { SankeyTooltip } from "@/components/charts/sankey/sankey-tooltip"
import type { SankeyData } from "@/components/charts/sankey/sankey-chart"
import type { PieData } from "@/components/charts/pie-context"
import type { FunnelStage } from "@/components/charts/funnel-chart"
import { Grid } from "@/components/charts/grid"
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip"
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
  description?: string
  chartType: ChartType
  sql: string
  xCol: string
  yCol: string
  yCols?: string[]
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

// ── Bklit data helpers ────────────────────────────────────────────────────────

function toBarChartData(result: QueryResult, xCol: string, yCol: string) {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  return result.rows.map((row) => {
    const r = row as unknown[]
    return {
      [xCol]: String(r[xi] ?? ""),
      [yCol]: parseFloat(String(r[yi] ?? "0")) || 0,
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
      value: parseFloat(String(r[yi] ?? "0")) || 0,
    }
  })
}

function toFunnelData(result: QueryResult, xCol: string, yCol: string): FunnelStage[] {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  return result.rows.map((row) => {
    const r = row as unknown[]
    return {
      label: String(r[xi] ?? ""),
      value: parseFloat(String(r[yi] ?? "0")) || 0,
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
      obj[col] = ci >= 0 ? parseFloat(String(r[ci] ?? "0")) || 0 : 0
    }
    return obj
  })
}

function toSankeyData(result: QueryResult, xCol: string, yCol: string): SankeyData {
  const srcIdx = xCol ? result.columns.indexOf(xCol) : 0
  const tgtIdx = yCol ? result.columns.indexOf(yCol) : 1
  const valIdx = result.columns.findIndex((_, i) => i !== srcIdx && i !== tgtIdx)
  const rowValue = (row: unknown, index: number) => (row as unknown[])[index]

  const nodeNames = new Set<string>()
  const rawLinks: { source: string; target: string; value: number }[] = []

  for (const row of result.rows) {
    const src = String(rowValue(row, srcIdx) ?? "")
    const tgt = String(rowValue(row, tgtIdx) ?? "")
    const val = parseFloat(String(rowValue(row, Math.max(0, valIdx)) ?? "0"))
    if (src && tgt && Number.isFinite(val) && val > 0) {
      nodeNames.add(src)
      nodeNames.add(tgt)
      rawLinks.push({ source: src, target: tgt, value: val })
    }
  }

  const nodeArray = [...nodeNames]
  return {
    nodes: nodeArray.map((name) => ({ name })),
    links: rawLinks.map((l) => ({
      source: nodeArray.indexOf(l.source),
      target: nodeArray.indexOf(l.target),
      value: l.value,
    })),
  }
}

// ── ScatterPlot ───────────────────────────────────────────────────────────────

function ScatterPlot({ result, xCol, yCol }: { result: QueryResult; xCol: string; yCol: string }) {
  const [ref, { width, height }] = useMeasure({ debounce: 10 })
  const m = { top: 16, right: 18, bottom: 40, left: 48 }
  const textColor = "#71717a"
  const gridColor = "#e4e4e7"
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)

  const points = useMemo(() => {
    return result.rows.flatMap((row) => {
      const r = row as unknown[]
      const x = parseFloat(String(r[xi] ?? ""))
      const y = parseFloat(String(r[yi] ?? ""))
      return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : []
    })
  }, [result, xi, yi])

  const iw = Math.max(0, width - m.left - m.right)
  const ih = Math.max(0, height - m.top - m.bottom)

  const { xScale, yScale, xTicks, yTicks } = useMemo(() => {
    if (!points.length || !iw || !ih)
      return { xScale: (_: number) => 0, yScale: (_: number) => ih, xTicks: [] as number[], yTicks: [] as number[] }
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xPad = (xMax - xMin) * 0.06 || 1
    const yPad = (yMax - yMin) * 0.1 || 1
    const xD = [xMin - xPad, xMax + xPad]
    const yD = [yMin - yPad, yMax + yPad]
    const xR = xD[1] - xD[0], yR = yD[1] - yD[0]
    const xScale = (v: number) => ((v - xD[0]) / xR) * iw
    const yScale = (v: number) => ih - ((v - yD[0]) / yR) * ih
    const n = 4
    const xTicks = Array.from({ length: n + 1 }, (_, i) => xD[0] + (i / n) * xR)
    const yTicks = Array.from({ length: n + 1 }, (_, i) => yD[0] + (i / n) * yR)
    return { xScale, yScale, xTicks, yTicks }
  }, [points, iw, ih])

  const fmt = (n: number) =>
    Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
    : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}k`
    : Number.isInteger(n) ? String(n) : n.toFixed(1)

  return (
    <div ref={ref} className="h-full w-full">
      {width > 0 && height > 0 && (
        <svg width={width} height={height}>
          <g transform={`translate(${m.left},${m.top})`}>
            {yTicks.map((t) => (
              <line key={t} x1={0} x2={iw} y1={yScale(t)} y2={yScale(t)} stroke={gridColor} strokeWidth={1} />
            ))}
            {yTicks.map((t) => (
              <text key={t} x={-6} y={yScale(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={textColor}>
                {fmt(t)}
              </text>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={xScale(t)} y={ih + 14} textAnchor="middle" fontSize={10} fill={textColor}>
                {fmt(t)}
              </text>
            ))}
            <text x={iw / 2} y={ih + 30} textAnchor="middle" fontSize={10} fill={textColor}>{xCol}</text>
            {points.map((p, i) => (
              <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={5} fill="var(--chart-1)" opacity={0.72} />
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}

// ── HeatmapChart ──────────────────────────────────────────────────────────────

function HeatmapChart({ result, xCol, yCol }: { result: QueryResult; xCol: string; yCol: string }) {
  const [ref, { width, height }] = useMeasure({ debounce: 10 })
  const m = { top: 16, right: 24, bottom: 56, left: 88 }
  const textColor = "#71717a"
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  const valIdx = result.columns.findIndex((_, i) => {
    if (i === xi || i === yi) return false
    return result.rows.some((row) => Number.isFinite(parseFloat(String((row as unknown[])[i] ?? ""))))
  })

  const { xLabels, yLabels, cells, maxVal } = useMemo(() => {
    const rv = (row: unknown, i: number) => (row as unknown[])[i]
    const xSet = [...new Set(result.rows.map((r) => String(rv(r, xi) ?? "")))]
    const ySet = yi >= 0 ? [...new Set(result.rows.map((r) => String(rv(r, yi) ?? "")))] : []
    const safeValIdx = Math.max(0, valIdx)
    const cells = result.rows.flatMap((row) => {
      const x = xSet.indexOf(String(rv(row, xi) ?? ""))
      const y = ySet.indexOf(String(rv(row, yi) ?? ""))
      const v = parseFloat(String(rv(row, safeValIdx) ?? ""))
      return x >= 0 && y >= 0 && Number.isFinite(v) && v > 0 ? [{ x, y, v }] : []
    })
    const maxVal = Math.max(...cells.map((c) => c.v), 1)
    return { xLabels: xSet, yLabels: ySet, cells, maxVal }
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
    <div ref={ref} className="h-full w-full">
      {width > 0 && height > 0 && (
        <svg width={width} height={height}>
          <g transform={`translate(${m.left},${m.top})`}>
            {cells.map((cell, i) => {
              const cx = cell.x * cw + cw / 2
              const cy = cell.y * ch + ch / 2
              return (
                <g key={i}>
                  <rect x={cell.x * cw} y={cell.y * ch} width={Math.max(0, cw - 2)} height={Math.max(0, ch - 2)} fill={cellColor(cell.v)} rx={2} />
                  {cw > 30 && ch > 16 && (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#18181b">
                      {cell.v.toLocaleString()}
                    </text>
                  )}
                </g>
              )
            })}
            {xLabels.map((label, i) => (
              <text
                key={label}
                x={i * cw + cw / 2}
                y={ih + 12}
                fontSize={10}
                fill={textColor}
                textAnchor="end"
                transform={`rotate(-30, ${i * cw + cw / 2}, ${ih + 12})`}
              >
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            ))}
            {yLabels.map((label, i) => (
              <text key={label} x={-6} y={i * ch + ch / 2} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={textColor}>
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
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
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
  const smallMargin = { top: 16, right: 16, bottom: 36, left: 44 }

  if (chartType === "bar") {
    const isMultiSeries = yCols && yCols.length > 1
    if (isMultiSeries) {
      const data = toStackedBarData(result, xCol, yCols)
      return (
        <BarChart
          data={data}
          xDataKey={xCol}
          className="h-full"
          aspectRatio="auto"
          margin={{ top: 16, right: 24, bottom: 16, left: 100 }}
          animationDuration={600}
          orientation="horizontal"
          stacked
        >
          <Grid horizontal={false} vertical />
          {yCols.map((col, i) => (
            <Bar key={col} dataKey={col} fill={STACK_COLORS[i % STACK_COLORS.length]} />
          ))}
          <ChartTooltip showDatePill={false} />
          <BarYAxis />
        </BarChart>
      )
    }
    const data = toBarChartData(result, xCol, yCol)
    return (
      <BarChart
        data={data}
        xDataKey={xCol}
        className="h-full"
        aspectRatio="auto"
        margin={smallMargin}
        animationDuration={600}
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
        data={data}
        xDataKey={xCol}
        className="h-full"
        aspectRatio="auto"
        margin={smallMargin}
        animationDuration={600}
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
      <div className="h-full flex items-center gap-6 px-2">
        <div className="h-full aspect-square shrink-0">
          <PieChart
            data={data}
            innerRadius={60}
            padAngle={0.02}
            cornerRadius={4}
          >
            {data.map((_, i) => (
              <PieSlice key={i} index={i} />
            ))}
          </PieChart>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
          {data.map((item, i) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0"
            return (
              <div key={item.label} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: STACK_COLORS[i % STACK_COLORS.length] }}
                />
                <span className="truncate text-foreground/75">{item.label}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground pl-3">
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
        data={data}
        className="h-full"
        orientation="horizontal"
        showPercentage
      />
    )
  }

  if (chartType === "sankey") {
    const data = toSankeyData(result, xCol, yCol)
    return (
      <SankeyChart
        data={data}
        className="h-full"
        aspectRatio="auto"
        animationDuration={600}
        margin={{ top: 24, right: 160, bottom: 24, left: 160 }}
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

// ── Default panels ────────────────────────────────────────────────────────────
// Panels are organized around the cross-brand journey:
// discover whitespace, prioritize audiences, and route offers to channels.

const DEFAULT_PANELS: Panel[] = [
  {
    id: "journey-funnel",
    title: "Journey Funnel - HDBank Travel Customers to VietJet Activation",
    description:
      "Shows how the bank audience narrows from all HDBank customers into proven travel spenders, airline/OTA buyers, customers with no VietJet spend yet, and final activation candidates.",
    chartType: "funnel",
    sql: "SELECT step_order, journey_step, customers FROM (SELECT 1 AS step_order, 'All HDBank customers' AS journey_step, COUNT(*) AS customers FROM hdbank.hdbank_partnership_prod_silver.customers_v1 UNION ALL SELECT 2 AS step_order, 'Travel spenders' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND travel_spend > 0 UNION ALL SELECT 3 AS step_order, 'Airline or OTA spenders' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND (airline_ticket_spend > 0 OR ota_travel_spend > 0) UNION ALL SELECT 4 AS step_order, 'No VietJet spend yet' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND travel_spend > 0 AND has_vietjet_spend = 0 UNION ALL SELECT 5 AS step_order, 'Activation candidates' AS journey_step, COUNT(*) AS customers FROM hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1) funnel ORDER BY step_order",
    xCol: "journey_step",
    yCol: "customers",
  },
  {
    id: "relationship-split",
    title: "Relationship Split - HDBank Only, VietJet Only, Shared",
    description:
      "A simple market map of who belongs to one partner versus both. The largest single-brand pools are the cleanest cross-sell whitespace.",
    chartType: "pie",
    sql: "SELECT CASE WHEN has_hdbank_relationship = true AND has_vietjetair_relationship = true THEN 'Shared customer' WHEN has_hdbank_relationship = true THEN 'HDBank only' WHEN has_vietjetair_relationship = true THEN 'VietJet only' ELSE 'Unknown' END AS relationship_group, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 GROUP BY relationship_group ORDER BY customers DESC",
    xCol: "relationship_group",
    yCol: "customers",
  },
  {
    id: "opportunity-matrix",
    title: "Activation Segments - Co-brand Audience by Priority Tier",
    description:
      "Collapses the readiness × flyer matrix into four actionable tiers. Prime Targets (both scores ≥ 0.6) are the first-wave campaign audience; HDBank-led and VietJet-led segments follow; Nurture is the long-cycle pool.",
    chartType: "bar",
    sql: "SELECT CASE WHEN cross_sell_readiness_score >= 0.6 AND frequent_flyer_score >= 0.6 THEN 'Prime Targets' WHEN cross_sell_readiness_score >= 0.6 THEN 'HDBank-led' WHEN frequent_flyer_score >= 0.6 THEN 'VietJet-led' ELSE 'Nurture' END AS segment, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true OR has_vietjetair_relationship = true GROUP BY segment ORDER BY customers DESC",
    xCol: "segment",
    yCol: "customers",
  },
  {
    id: "cobrand-card-journey",
    title: "Co-brand Card Journey - Travel Spender to Active Cardholder",
    description:
      "End-to-end funnel from VietJet travelers with an HDBank relationship through high-affinity targeting, offer receipt, card application, activation, and first co-brand booking. Reveals where the biggest drop-offs occur in the card acquisition journey.",
    chartType: "funnel",
    sql: "SELECT step_order, journey_step, customers FROM (SELECT 1 AS step_order, 'Shared customers' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND has_vietjetair_relationship = true UNION ALL SELECT 2 AS step_order, 'Travel affinity >= 0.5' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND has_vietjetair_relationship = true AND travel_affinity_score >= 0.5 UNION ALL SELECT 3 AS step_order, 'Cross-sell ready' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND has_vietjetair_relationship = true AND travel_affinity_score >= 0.5 AND cross_sell_readiness_score >= 0.6 UNION ALL SELECT 4 AS step_order, 'Prime targets' AS journey_step, COUNT(*) AS customers FROM partnership.co_brand_silver.customer_360_v1 WHERE has_hdbank_relationship = true AND has_vietjetair_relationship = true AND cross_sell_readiness_score >= 0.6 AND frequent_flyer_score >= 0.6 UNION ALL SELECT 5 AS step_order, 'Activation candidates' AS journey_step, COUNT(*) AS customers FROM hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1) funnel ORDER BY step_order",
    xCol: "journey_step",
    yCol: "customers",
  },
  {
    id: "vietjet-finance-value",
    title: "VietJet to HDBank - Finance Value by Membership Tier",
    description:
      "Shows where HDBank financing and co-brand card offers have the largest booking value base among VietJet customers.",
    chartType: "bar",
    sql: "SELECT membership_tier, COUNT(*) AS customers, ROUND(AVG(gross_booking_value), 0) AS avg_booking_value, ROUND(SUM(gross_booking_value), 0) AS total_booking_value FROM partnership.co_brand_silver.customer_360_v1 WHERE has_vietjetair_relationship = true GROUP BY membership_tier ORDER BY total_booking_value DESC",
    xCol: "membership_tier",
    yCol: "total_booking_value",
  },
  {
    id: "competitor-recovery",
    title: "VietJet Recovery - Competitor Booking Pressure by City",
    description:
      "Cities where VietJet flyers are also booking competitors. These are strong targets for co-brand rewards, installment perks, or route-specific win-back offers.",
    chartType: "bar",
    sql: "SELECT city, SUM(vietjet_booking_count) AS vietjet_bookings, SUM(competitor_booking_count) AS competitor_bookings FROM partnership.co_brand_silver.customer_360_v1 WHERE has_vietjetair_relationship = true GROUP BY city ORDER BY competitor_bookings DESC",
    xCol: "city",
    yCol: "competitor_bookings",
  },
  {
    id: "offer-routing",
    title: "Offer Routing - Source to Use Case to Channel",
    description:
      "Unified campaign flow from partner source to use case to recommended channel. This makes campaign operations visible: who originates demand, what the offer is for, and where outreach should happen.",
    chartType: "sankey",
    sql: "SELECT source_company AS source, use_case AS target, COUNT(*) AS value FROM partnership.co_brand_gold.co_brand_offer_audience_v1 GROUP BY source_company, use_case UNION ALL SELECT use_case AS source, recommended_channel AS target, COUNT(*) AS value FROM partnership.co_brand_gold.co_brand_offer_audience_v1 GROUP BY use_case, recommended_channel",
    xCol: "source",
    yCol: "target",
  },
  {
    id: "service-recovery",
    title: "Service Recovery - Incident Customers by Priority Band",
    description:
      "High-incident, high-value flyers can be turned into loyalty moments. Use this to separate operational recovery from regular marketing sends.",
    chartType: "bar",
    sql: "SELECT vietjet_priority_band, COUNT(*) AS customers, ROUND(AVG(service_recovery_score), 3) AS avg_recovery_score FROM partnership.co_brand_silver.customer_360_v1 WHERE incident_count > 0 GROUP BY vietjet_priority_band ORDER BY customers DESC",
    xCol: "vietjet_priority_band",
    yCol: "customers",
  },
]

const DEFAULT_LAYOUT: Layout = [
  { i: "journey-funnel", x: 0, y: 0, w: 2, h: 7 },
  { i: "relationship-split", x: 0, y: 7, w: 2, h: 8 },
  { i: "opportunity-matrix", x: 0, y: 15, w: 2, h: 8 },
  { i: "cobrand-card-journey", x: 0, y: 23, w: 2, h: 7 },
  { i: "vietjet-finance-value", x: 0, y: 30, w: 1, h: 6 },
  { i: "competitor-recovery", x: 1, y: 30, w: 1, h: 6 },
  { i: "offer-routing", x: 0, y: 36, w: 2, h: 8 },
  { i: "service-recovery", x: 0, y: 44, w: 2, h: 6 },
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
  const canRenderChart = data.status === "ok" && !!data.result && !!panel.xCol && !!panel.yCol

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
          <IconGripVertical
            size={12}
            className="text-muted-foreground shrink-0"
          />
        )}
        <span className="text-xs font-medium flex-1 truncate">
          {panel.title}
        </span>
        {data.status === "running" && (
          <IconLoader2
            size={12}
            className="text-muted-foreground animate-spin shrink-0"
          />
        )}
        {data.status === "error" && (
          <IconAlertCircle size={12} className="text-destructive shrink-0" />
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
              <IconPencil size={12} className="mr-2" />
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
              <IconTrash size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 min-h-0 p-1">
        {data.status === "idle" && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <IconChartHistogram size={22} />
            <p className="text-[11px]">Use menu to configure</p>
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
        {data.status === "ok" && canRenderChart && (
          <PanelChart
            chartType={panel.chartType}
            result={data.result!}
            xCol={panel.xCol}
            yCol={panel.yCol}
            yCols={panel.yCols}
          />
        )}
        {data.status === "ok" && !canRenderChart && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <IconCheck size={22} />
            <p className="text-[11px]">
              {data.result?.row_count} rows — configure X/Y columns
            </p>
          </div>
        )}
      </div>
      {panel.description && (
        <p className="px-3 py-2 text-xs text-muted-foreground border-t leading-relaxed shrink-0 min-h-[2.5rem] max-h-[5rem] overflow-y-auto">
          {panel.description}
        </p>
      )}
    </div>
  )
}

// ── Chart type config ─────────────────────────────────────────────────────────

const CHART_TYPE_CONFIG: Record<
  ChartType,
  { label: string; icon: TablerIcon }
> = {
  bar: { label: "Bar", icon: IconChartHistogram },
  line: { label: "Line", icon: IconChartBar },
  area: { label: "Area", icon: IconChartArea },
  pie: { label: "Pie / Donut", icon: IconChartPie },
  scatter: { label: "Scatter", icon: IconChartScatter },
  sankey: { label: "Sankey / Flow", icon: IconChartSankey },
  funnel: { label: "Funnel", icon: IconChartDots },
  heatmap: { label: "Heatmap", icon: IconChartDots },
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
      <div className="px-4 py-3 border-b shrink-0 flex flex-col gap-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Panel
        </p>
        <Input
          value={panel.title}
          onChange={(e) => onChange({ ...panel, title: e.target.value })}
          className="h-7 text-xs"
          placeholder="Panel title"
        />
        <Textarea
          value={panel.description ?? ""}
          onChange={(e) => onChange({ ...panel, description: e.target.value })}
          rows={4}
          placeholder="Description (shown below the chart)"
          className="min-h-24 text-xs"
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
              <IconLoader2 size={11} className="animate-spin" />
            ) : (
              <IconPlayerPlay size={11} />
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
              {(Object.keys(CHART_TYPE_CONFIG) as ChartType[]).map((type) => {
                const ChartTypeIcon = CHART_TYPE_CONFIG[type].icon
                return (
                  <SelectItem
                    key={type}
                    value={type}
                    textValue={CHART_TYPE_CONFIG[type].label}
                  >
                    <div className="flex items-center gap-1.5">
                      <ChartTypeIcon size={12} className="shrink-0" />
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
  "Cross-sell readiness vs. frequent flyer score by segment",
  "Top cities for prime target activation candidates",
  "Service recovery score distribution among high-incident flyers",
  "VietJet membership tiers by HDBank credit score band",
  "Competitor booking pressure in prime target cities",
  "Offer channel mix for co-brand vs. finance use cases",
]

const PANEL_MENTION_RE = /@\[(.*?)\]\(panel:([^)]+)\)/g

function extractMentionedPanelIds(text: string) {
  const ids: string[] = []
  for (const match of text.matchAll(PANEL_MENTION_RE)) {
    const id = match[2]
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function stripPanelMentionMarkup(text: string) {
  return text.replace(PANEL_MENTION_RE, (_, label: string) => `@${label}`)
}

function getActiveMention(text: string, caret: number) {
  const uptoCaret = text.slice(0, caret)
  const at = uptoCaret.lastIndexOf("@")
  if (at === -1) return null

  const fragment = uptoCaret.slice(at)
  if (fragment.startsWith("@[")) return null
  if (fragment.includes("\n")) return null
  if (/\s/.test(fragment.slice(1))) return null

  return {
    start: at,
    end: caret,
    query: fragment.slice(1),
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
    results: Record<string, QueryResult>,
  ) => void
  onPanelsEdited: (
    updates: Array<{ panel: Panel; result: QueryResult }>,
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
    [input, caretPos],
  )
  const selectedPanels = useMemo(
    () =>
      selectedPanelIds
        .map((id) => panels.find((panel) => panel.id === id) ?? null)
        .filter((panel): panel is Panel => !!panel),
    [panels, selectedPanelIds],
  )

  const mentionPanels = useMemo(() => {
    if (!activeMention) return []
    const query = activeMention.query.trim().toLowerCase()
    return panels.filter((panel) => {
      if (!query) return true
      return (
        panel.title.toLowerCase().includes(query) ||
        (panel.description ?? "").toLowerCase().includes(query)
      )
    })
  }, [activeMention, panels])

  useEffect(() => {
    setMentionIndex(0)
  }, [activeMention?.query])

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
            description: p.description,
            chartType: p.chartType,
            sql: p.sql,
            xCol: p.xCol,
            yCol: p.yCol,
            resultPreview:
              panelDataRef.current[p.id]?.status === "ok" &&
              panelDataRef.current[p.id]?.result
                ? {
                    columns: panelDataRef.current[p.id]!.result!.columns,
                    rows: panelDataRef.current[p.id]!.result!.rows.slice(0, 10),
                    rowCount: panelDataRef.current[p.id]!.result!.row_count,
                  }
                : undefined,
          })),
          selectedPanelIds: selectedPanelIdsRef.current,
          selectedPanelId:
            selectedPanelIdsRef.current[
              selectedPanelIdsRef.current.length - 1
            ] ?? null,
          mentionedPanelIds: mentionedPanelIdsRef.current,
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

  const insertPanelMention = useCallback(
    (panel: Panel) => {
      if (!activeMention) return
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
    [activeMention, caretPos, input],
  )

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
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
          (idx) => (idx - 1 + mentionPanels.length) % mentionPanels.length,
        )
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        insertPanelMention(mentionPanels[mentionIndex] ?? mentionPanels[0]!)
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
          activeMention.start,
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
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Ask about your data or what an existing panel means.
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
                <IconLoader2 size={12} className="animate-spin" />
                Generating panels…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 min-w-0 overflow-x-hidden border-t p-2.5 flex flex-col gap-2">
        {selectedPanels.length > 0 ? (
          <div className="flex min-w-0 items-stretch gap-2">
            <button
              type="button"
              className="flex shrink-0 items-center justify-center self-stretch rounded-md border bg-background px-2 text-muted-foreground hover:text-foreground"
              onClick={onClearSelectedPanels}
              title="Clear selected panels"
              aria-label="Clear selected panels"
            >
              <IconX size={12} />
            </button>
            <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap">
              {selectedPanels.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => onRemoveSelectedPanel(panel.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] text-foreground/85 hover:bg-accent"
                  title={panel.title}
                >
                  <span>{panel.title}</span>
                  <IconX size={10} className="shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Popover open={!!activeMention}>
          <PopoverAnchor asChild>
            <InputGroup className="min-h-[132px] min-w-0 items-stretch overflow-x-hidden rounded-xl bg-background">
              <InputGroupTextarea
                ref={textareaRef}
                value={input}
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
                rows={3}
                className="min-h-[84px] w-full max-w-full overflow-x-hidden px-3 pt-3 text-xs [field-sizing:fixed]"
              />
              <InputGroupAddon
                align="block-end"
                className="items-center justify-between gap-2 border-t px-3 py-2"
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1 w-full">
                    <Select
                      value={modelId}
                      onValueChange={(v) => onModelChange(v as ModelId)}
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
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    disabled={!input.trim() || isLoading}
                    onClick={handleSend}
                  >
                    {isLoading ? (
                      <IconLoader2 size={12} className="animate-spin" />
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
            side="top"
            className="w-[320px] p-1.5"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Mention Panel
            </div>
            <div className="max-h-56 overflow-y-auto">
              {mentionPanels.length > 0 ? (
                mentionPanels.map((panel, idx) => (
                  <button
                    key={panel.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertPanelMention(panel)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      idx === mentionIndex
                        ? "bg-muted text-foreground"
                        : "text-foreground/85 hover:bg-muted/70",
                    )}
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
                <div className="px-2 py-3 text-xs text-muted-foreground">
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
            <IconLoader2 size={11} className="animate-spin shrink-0" />
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
            <IconChartDots size={11} className="text-primary shrink-0" />
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
            <IconLoader2 size={11} className="animate-spin shrink-0" />
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
            <IconPencil size={11} className="text-primary shrink-0" />
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [configPanelId, setConfigPanelId] = useState<string | null>(null)
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
      { i: id, x: 0, y: Infinity, w: 1, h: 4 } as LayoutItem,
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
    if (configPanelId === id) setConfigPanelId(null)
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
                x: i % 2,
                y: Infinity,
                w: 1,
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

  const configPanel = panels.find((p) => p.id === configPanelId) ?? null
  const configPanelData = configPanelId
    ? (panelData[configPanelId] ?? {
        status: "idle",
        result: null,
        error: null,
      })
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
            <IconRefresh size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleAddPanel}
          >
            <IconPlus size={13} />
            Add Panel
          </Button>
          <Button
            variant={editing ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setEditing((v) => !v)
              if (editing) setSelectedIds([])
            }}
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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: AI Composer */}
        <div className="flex shrink-0 h-full" style={{ width: composerWidth }}>
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r bg-background">
            <AiComposer
              sessionId={activeId}
              modelId={modelId}
              panels={panels}
              panelData={panelData}
              selectedPanelIds={selectedIds}
              onRemoveSelectedPanel={(id) =>
                setSelectedIds((prev) =>
                  prev.filter((selectedId) => selectedId !== id),
                )
              }
              onClearSelectedPanels={() => setSelectedIds([])}
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
            if (e.target === e.currentTarget) setSelectedIds([])
          }}
        >
          {panels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <IconSparkles size={36} className="opacity-20" />
              <p className="text-sm">
                Ask the AI composer to generate panels, or click{" "}
                <strong>Add Panel</strong>.
              </p>
            </div>
          ) : mounted ? (
            <ReactGridLayout
              width={width}
              layout={layout}
              gridConfig={{ cols: 2, rowHeight: 60, margin: [8, 8] }}
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
                    selected={selectedIds.includes(panel.id)}
                    onClick={() =>
                      setSelectedIds((prev) =>
                        prev.includes(panel.id)
                          ? prev.filter((id) => id !== panel.id)
                          : [...prev, panel.id],
                      )
                    }
                    onConfigure={() => {
                      setSelectedIds((prev) =>
                        prev.includes(panel.id) ? prev : [...prev, panel.id],
                      )
                      setConfigPanelId(panel.id)
                    }}
                    onDelete={() => handleDeletePanel(panel.id)}
                  />
                </div>
              ))}
            </ReactGridLayout>
          ) : null}
        </div>

        {/* Right: Panel config sidebar */}
        {configPanel && configPanelData && (
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
                  onClick={() => setConfigPanelId(null)}
                >
                  <IconX size={13} />
                </button>
              </div>
              <PanelSidebar
                panel={configPanel}
                data={configPanelData}
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
