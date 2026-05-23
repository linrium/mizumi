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
  IconDots,
  type TablerIcon,
} from "@tabler/icons-react"
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
  description?: string
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
    const valIdx = result.columns.findIndex(
      (_, i) => i !== srcIdx && i !== tgtIdx,
    )

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
// Panels are organised as four user stories followed by a joint campaign view.
//
// Story 1 (HDBank → VietJet): Travel Spender, Not Yet a VietJet Flyer
// Story 2 (HDBank):           Shared Customer Ready for Credit Limit Upgrade
// Story 3 (VietJet → HDBank): Frequent Flyer with No HDBank Relationship
// Story 4 (VietJet):          Lapsing Flyer Reactivated via Financial Incentive
// Joint:                      Co-brand campaign audience and activation funnel

const DEFAULT_PANELS: Panel[] = [
  // ── Story 1: Travel Spender, Not Yet a VietJet Flyer ──────────────────────
  {
    id: "s1-a",
    title: "Story 1 · VietJet Spend Gap Among HDBank Travel Customers",
    description:
      "Of all HDBank customers with measurable travel spend, how many have never transacted with VietJet. This untapped pool is the primary target for the co-brand card activation — proven travelers who just haven't flown VietJet yet.",
    chartType: "pie",
    sql: "SELECT CASE WHEN has_vietjet_spend = 1 THEN 'Already flies VietJet' ELSE 'No VietJet spend yet' END AS spend_group, COUNT(*) AS customers FROM hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1 GROUP BY has_vietjet_spend",
    xCol: "spend_group",
    yCol: "customers",
  },
  {
    id: "s1-b",
    title: "Story 1 · Travel Affinity Score of Untapped Customers",
    description:
      "Distribution of travel affinity scores for HDBank customers who have never spent with VietJet. High-affinity customers (0.6+) are proven travelers — the most likely to convert when offered a co-brand VietJet card with miles on existing spend.",
    chartType: "bar",
    sql: "SELECT CASE WHEN travel_affinity_score >= 0.8 THEN '0.8–1.0 High' WHEN travel_affinity_score >= 0.6 THEN '0.6–0.8' WHEN travel_affinity_score >= 0.4 THEN '0.4–0.6' WHEN travel_affinity_score >= 0.2 THEN '0.2–0.4' ELSE '0.0–0.2 Low' END AS score_band, COUNT(*) AS customers FROM hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1 WHERE has_vietjet_spend = 0 GROUP BY score_band ORDER BY score_band DESC",
    xCol: "score_band",
    yCol: "customers",
  },
  {
    id: "s1-c",
    title: "Story 1 · VietJet Activation Candidates by Offer & Channel",
    description:
      "HDBank's gold output: offer propositions assigned to VietJet activation candidates with their recommended outreach channels. The sankey shows which offers flow to which channels — thicker bands are higher-volume paths where campaign spend should concentrate first.",
    chartType: "sankey",
    sql: "SELECT offer_name AS source, recommended_channel AS target, COUNT(*) AS value FROM hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1 GROUP BY offer_name, recommended_channel",
    xCol: "source",
    yCol: "target",
  },
  // ── Story 2: Shared Customer Ready for Credit Limit Upgrade ───────────────
  {
    id: "s2-a",
    title: "Story 2 · Shared VietJet Spenders by Credit Score Tier",
    description:
      "HDBank customers who are already shared with VietJet AND have active VietJet card spend, grouped by credit score tier. Prime-tier customers (750+) are pre-qualified for a proactive limit upgrade — no application form needed, offer can be pushed in-app.",
    chartType: "bar",
    sql: "SELECT CASE WHEN c.credit_score >= 750 THEN 'Prime (750+)' WHEN c.credit_score >= 650 THEN 'Near-prime (650–749)' ELSE 'Sub-prime (<650)' END AS credit_tier, COUNT(*) AS customers, ROUND(AVG(t.total_card_spend), 0) AS avg_total_spend FROM hdbank.hdbank_partnership_prod_silver.customers_v1 c JOIN hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1 t ON c.customer_id = t.customer_id WHERE c.shared_customer = true AND t.has_vietjet_spend = 1 GROUP BY credit_tier ORDER BY customers DESC",
    xCol: "credit_tier",
    yCol: "customers",
  },
  {
    id: "s2-b",
    title: "Story 2 · Preferred Outreach Channel for Shared Customers",
    description:
      "How shared HDBank+VietJet customers prefer to be contacted. Channel alignment is critical — a limit upgrade offer pushed through the wrong channel sees lower open rates and burns campaign budget. Match the channel to the customer's stated preference.",
    chartType: "bar",
    sql: "SELECT c.preferred_channel, COUNT(*) AS customers FROM hdbank.hdbank_partnership_prod_silver.customers_v1 c JOIN hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1 t ON c.customer_id = t.customer_id WHERE c.shared_customer = true AND t.has_vietjet_spend = 1 GROUP BY c.preferred_channel ORDER BY customers DESC",
    xCol: "preferred_channel",
    yCol: "customers",
  },
  // ── Story 3: Frequent Flyer with No HDBank Relationship ───────────────────
  {
    id: "s3-a",
    title: "Story 3 · Non-Shared VietJet Flyers by Loyalty Tier",
    description:
      "VietJet frequent flyers who have no existing HDBank relationship, grouped by frequent-flyer score band. High-tier non-shared flyers are HDBank's highest-value acquisition targets — strong travel behaviour signals credit-worthiness with zero existing relationship friction.",
    chartType: "bar",
    sql: "SELECT CASE WHEN b.frequent_flyer_score >= 0.7 THEN 'High (0.7+)' WHEN b.frequent_flyer_score >= 0.4 THEN 'Mid (0.4–0.7)' ELSE 'Low (<0.4)' END AS flyer_tier, COUNT(*) AS flyers, ROUND(AVG(b.avg_booking_value), 0) AS avg_booking_value FROM vietjetair.vietjetair_partnership_prod_silver.customers_v1 c JOIN vietjetair.vietjetair_partnership_prod_silver.booking_features_v1 b ON c.customer_id = b.customer_id WHERE c.shared_customer = false GROUP BY flyer_tier ORDER BY flyers DESC",
    xCol: "flyer_tier",
    yCol: "flyers",
  },
  {
    id: "s3-b",
    title: "Story 3 · HDBank Finance Candidates by Use Case",
    description:
      "VietJet's gold output: which finance propositions were matched to non-shared frequent flyers. Installment plans appeal to high-value occasional bookers; co-brand card offers suit high-frequency travelers. The mix here drives the offer creative and approval workflow.",
    chartType: "bar",
    sql: "SELECT use_case, COUNT(*) AS candidates, ROUND(AVG(propensity_score), 3) AS avg_propensity FROM vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1 GROUP BY use_case ORDER BY candidates DESC",
    xCol: "use_case",
    yCol: "candidates",
  },
  // ── Story 4: Lapsing Flyer Reactivated via Financial Incentive ────────────
  {
    id: "s4-a",
    title: "Story 4 · Finance Candidates by Membership Tier",
    description:
      "VietJet finance candidates grouped by membership tier. Silver and Gold members carry past loyalty signal — a financial incentive (0% instalment for 3 months) is far more likely to re-engage them than a flat discount, because the perceived value scales with booking size.",
    chartType: "bar",
    sql: "SELECT v.membership_tier, COUNT(DISTINCT h.customer_id) AS candidates, ROUND(AVG(h.propensity_score), 3) AS avg_propensity FROM vietjetair.vietjetair_partnership_prod_silver.customers_v1 v JOIN vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1 h ON v.customer_id = h.customer_id GROUP BY v.membership_tier ORDER BY candidates DESC",
    xCol: "membership_tier",
    yCol: "candidates",
  },
  {
    id: "s4-b",
    title: "Story 4 · Email Reachability of Finance Targets",
    description:
      "Email opt-in status among VietJet finance candidates. Email is the cheapest reactivation channel, but only works if consent exists. Customers without opt-in must be reached via in-app push or personal outreach — channels with higher cost but no consent gate.",
    chartType: "pie",
    sql: "SELECT CASE WHEN v.email_opt_in THEN 'Email reachable' ELSE 'No email consent' END AS reachability, COUNT(*) AS candidates FROM vietjetair.vietjetair_partnership_prod_silver.customers_v1 v JOIN vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1 h ON v.customer_id = h.customer_id GROUP BY v.email_opt_in",
    xCol: "reachability",
    yCol: "candidates",
  },
  // ── Joint Campaign View ────────────────────────────────────────────────────
  {
    id: "joint-a",
    title: "Joint Campaign · Co-brand Audience by Priority Band",
    description:
      "Unified co-brand audience across both companies, tiered by activation priority. Band A customers have strong propensity signals from both HDBank and VietJet — they appear in both gold tables and receive the first outreach wave with the strongest co-brand offer.",
    chartType: "pie",
    sql: "SELECT priority_band, COUNT(*) AS audience_count FROM partnership.co_brand_gold.co_brand_offer_audience_v1 GROUP BY priority_band ORDER BY audience_count DESC",
    xCol: "priority_band",
    yCol: "audience_count",
  },
  {
    id: "joint-b",
    title: "Joint Campaign · HDBank → VietJet Activation Funnel",
    description:
      "End-to-end activation flow: HDBank customer segments (left) map into cross-sell use cases (centre), which route to outreach channels (right). Thicker bands are higher-volume paths. Narrow bands reaching premium channels (e.g. personal banker) mark micro-segments worth dedicated campaign treatment.",
    chartType: "sankey",
    sql: "SELECT c.segment_name AS source, a.use_case AS target, COUNT(*) AS value FROM hdbank.hdbank_partnership_prod_silver.customers_v1 c JOIN hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1 a ON c.customer_id = a.customer_id GROUP BY c.segment_name, a.use_case UNION ALL SELECT a.use_case AS source, a.recommended_channel AS target, COUNT(*) AS value FROM hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1 a GROUP BY a.use_case, a.recommended_channel",
    xCol: "source",
    yCol: "target",
  },
]

const DEFAULT_LAYOUT: Layout = [
  // Story 1 — Travel Spender, Not Yet a VietJet Flyer
  { i: "s1-a", x: 0, y: 0, w: 1, h: 6 },
  { i: "s1-b", x: 1, y: 0, w: 1, h: 6 },
  { i: "s1-c", x: 0, y: 6, w: 2, h: 8 },
  // Story 2 — Shared Customer Credit Limit Upgrade
  { i: "s2-a", x: 0, y: 14, w: 1, h: 6 },
  { i: "s2-b", x: 1, y: 14, w: 1, h: 6 },
  // Story 3 — Frequent Flyer with No HDBank Relationship
  { i: "s3-a", x: 0, y: 20, w: 1, h: 6 },
  { i: "s3-b", x: 1, y: 20, w: 1, h: 6 },
  // Story 4 — Lapsing Flyer Reactivation
  { i: "s4-a", x: 0, y: 26, w: 1, h: 6 },
  { i: "s4-b", x: 1, y: 26, w: 1, h: 6 },
  // Joint Campaign
  { i: "joint-a", x: 0, y: 32, w: 2, h: 6 },
  { i: "joint-b", x: 0, y: 38, w: 2, h: 8 },
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
          <IconGripVertical size={12} className="text-muted-foreground shrink-0" />
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
  "HDBank customers by preferred channel",
  "VietJet membership tiers by average booking value",
  "Travel affinity score distribution across HDBank customers",
  "HDBank finance candidates from VietJet by propensity",
  "Shared customers between HDBank and VietJet",
  "Co-brand signal value by source company",
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
