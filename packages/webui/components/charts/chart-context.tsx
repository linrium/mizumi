"use client"

import type { scaleBand, scaleLinear, scaleTime } from "@visx/scale"

type ScaleLinear<Output, _Input = number> = ReturnType<
  typeof scaleLinear<Output>
>
type ScaleTime<Output, _Input = Date | number> = ReturnType<
  typeof scaleTime<Output>
>
type ScaleBand<Domain extends { toString: () => string }> = ReturnType<
  typeof scaleBand<Domain>
>

import type { Transition } from "motion/react"
import {
  createContext,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useContext,
} from "react"
import type { ChartSelection } from "./use-chart-interaction"

// CSS variable references for theming
export const chartCssVars = {
  background: "var(--chart-background)",
  badgeBackground: "var(--chart-marker-badge-background)",
  badgeForeground: "var(--chart-marker-badge-foreground)",
  crosshair: "var(--chart-crosshair)",
  foreground: "var(--chart-foreground)",
  foregroundMuted: "var(--chart-foreground-muted)",
  grid: "var(--chart-grid)",
  indicatorColor: "var(--chart-indicator-color)",
  indicatorSecondaryColor: "var(--chart-indicator-secondary-color)",
  label: "var(--chart-label)",
  linePrimary: "var(--chart-line-primary)",
  lineSecondary: "var(--chart-line-secondary)",
  markerBackground: "var(--chart-marker-background)",
  markerBorder: "var(--chart-marker-border)",
  markerForeground: "var(--chart-marker-foreground)",
  segmentBackground: "var(--chart-segment-background)",
  segmentLine: "var(--chart-segment-line)",
}

/** Default scatter series colors from the chart palette (`--chart-1` … `--chart-5`). */
export const defaultScatterColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

export interface Margin {
  bottom: number
  left: number
  right: number
  top: number
}

export interface TooltipData {
  /** Index in the data array */
  index: number
  /** The data point being hovered */
  point: Record<string, unknown>
  /** X position in pixels (relative to chart area) */
  x: number
  /** X positions for each series (for grouped bars), keyed by dataKey */
  xPositions?: Record<string, number>
  /** Y positions for each line, keyed by dataKey */
  yPositions: Record<string, number>
}

export interface LineConfig {
  dataKey: string
  stroke: string
  strokeWidth: number
}

export interface ChartContextValue {
  animationDuration: number
  /** CSS easing for clip-reveal / line draw (cartesian charts). */
  animationEasing?: string
  /** Width of each bar band */
  bandWidth?: number

  // Bar chart specific (optional - only present in BarChart)
  /** Band scale for categorical x-axis (bar charts) */
  barScale?: ScaleBand<string>
  /** X accessor for bar charts (returns string instead of Date) */
  barXAccessor?: (d: Record<string, unknown>) => string
  /** Clear the current selection */
  clearSelection?: () => void

  // Column width for spacing calculations
  columnWidth: number

  // ComposedChart + SeriesBar (optional)
  /** `SeriesBar` dataKeys in tree order, for grouped columns at each x */
  composedBarDataKeys?: string[]
  /** Gap between grouped `SeriesBar` columns in px. */
  composedBarGap?: number
  /** Target bar width in px (Recharts `barSize` style). */
  composedBarSize?: number
  /** Max bar width in px (Recharts `maxBarSize`). */
  composedMaxBarSize?: number
  /** When true, `SeriesBar` segments stack in child order at each x. */
  composedStacked?: boolean
  /** Vertical gap in px between stacked `SeriesBar` segments. Default: 0 */
  composedStackGap?: number
  /** Per-row cumulative offsets for stacked `SeriesBar` (data index → dataKey → offset). */
  composedStackOffsets?: Map<number, Map<string, number>>

  // Container ref for portals
  containerRef: RefObject<HTMLDivElement | null>
  // Data
  data: Record<string, unknown>[]

  // Pre-computed date labels for ticker animation
  dateLabels: string[]
  /** Motion enter transition (spring or tween) — drives clip reveal when spring. */
  enterTransition?: Transition
  height: number
  /** Index of currently hovered bar */
  hoveredBarIndex?: number | null

  // Candlestick chart specific (optional)
  /** Index of currently hovered candle */
  hoveredCandleIndex?: number | null
  innerHeight: number
  innerWidth: number

  // Animation state
  isLoaded: boolean

  // Line configurations (extracted from children)
  lines: LineConfig[]
  margin: Margin
  /** Bar chart orientation */
  orientation?: "vertical" | "horizontal"
  /** Increments when enter animation should replay. */
  revealEpoch?: number

  // Selection state (optional - only present when useChartInteraction is used)
  /** Current drag/pinch selection range */
  selection?: ChartSelection | null
  /** Setter for hovered bar index */
  setHoveredBarIndex?: (index: number | null) => void
  /** Setter for hovered candle index */
  setHoveredCandleIndex?: (index: number | null) => void
  setTooltipData: Dispatch<SetStateAction<TooltipData | null>>
  /** Whether bars are stacked */
  stacked?: boolean
  /** Stack offsets: Map of data index -> Map of dataKey -> cumulative offset */
  stackOffsets?: Map<number, Map<string, number>>

  // Tooltip state
  tooltipData: TooltipData | null

  // Dimensions
  width: number

  // X accessor - how to get the x value from data points
  xAccessor: (d: Record<string, unknown>) => Date

  // Scales
  xScale: ScaleTime<number, number>
  yScale: ScaleLinear<number, number>
}

const ChartContext = createContext<ChartContextValue | null>(null)

export function ChartProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: ChartContextValue
}) {
  return <ChartContext.Provider value={value}>{children}</ChartContext.Provider>
}

export function useChart(): ChartContextValue {
  const context = useContext(ChartContext)
  if (!context) {
    throw new Error(
      "useChart must be used within a ChartProvider. " +
        "Make sure your component is wrapped in <LineChart>, <AreaChart>, <BarChart>, or <ComposedChart>."
    )
  }
  return context
}

export default ChartContext
