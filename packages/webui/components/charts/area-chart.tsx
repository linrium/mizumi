"use client"

import { ParentSize } from "@visx/responsive"
import type { Transition } from "motion/react"
import {
  Children,
  isValidElement,
  type ReactNode,
  useMemo,
  useRef,
} from "react"
import { cn } from "@/lib/utils"
import { Area, type AreaProps } from "./area"
import type { LineConfig, Margin } from "./chart-context"
import { PatternArea } from "./pattern-area"
import { TimeSeriesChartInner } from "./time-series-chart-shell"

export interface AreaChartProps {
  /** Animation duration in milliseconds. Default: 1100 */
  animationDuration?: number
  /** CSS easing for clip-reveal. Default: cubic-bezier(0.85, 0, 0.15, 1) */
  animationEasing?: string
  /** Aspect ratio as "width / height". Default: "2 / 1" */
  aspectRatio?: string
  /** Child components (Area, Grid, ChartTooltip, etc.) */
  children: ReactNode
  /** Additional class name for the container */
  className?: string
  /** Data array - each item should have a date field and numeric values */
  data: Record<string, unknown>[]
  /** Motion enter transition (spring or cubic-bezier tween). */
  enterTransition?: Transition
  /** Chart margins */
  margin?: Partial<Margin>
  /** Signature of motion URL state — triggers reveal replay when it changes. */
  revealSignature?: string
  /** Key in data for the x-axis (date). Default: "date" */
  xDataKey?: string
}

const DEFAULT_MARGIN: Margin = { bottom: 40, left: 40, right: 40, top: 40 }

function extractAreaConfigs(children: ReactNode): LineConfig[] {
  const configs: LineConfig[] = []

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return
    }

    const childType = child.type as {
      displayName?: string
      name?: string
    }
    const componentName =
      typeof child.type === "function"
        ? childType.displayName || childType.name || ""
        : ""

    const props = child.props as AreaProps | undefined
    const isPatternArea =
      componentName === "PatternArea" || child.type === PatternArea
    const isAreaComponent =
      componentName === "Area" ||
      child.type === Area ||
      (props &&
        typeof props.dataKey === "string" &&
        props.dataKey.length > 0 &&
        !isPatternArea)

    if (isAreaComponent && props?.dataKey) {
      configs.push({
        dataKey: props.dataKey,
        stroke: props.stroke || props.fill || "var(--chart-line-primary)",
        strokeWidth: props.strokeWidth || 2,
      })
    }
  })

  return configs
}

interface ChartInnerProps {
  animationDuration: number
  animationEasing?: string
  children: ReactNode
  containerRef: React.RefObject<HTMLDivElement | null>
  data: Record<string, unknown>[]
  enterTransition?: Transition
  height: number
  margin: Margin
  revealSignature?: string
  width: number
  xDataKey: string
}

function ChartInner({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  animationEasing,
  enterTransition,
  revealSignature,
  children,
  containerRef,
}: ChartInnerProps) {
  const lines = useMemo(() => extractAreaConfigs(children), [children])

  return (
    <TimeSeriesChartInner
      animationDuration={animationDuration}
      animationEasing={animationEasing}
      clipPathId="chart-area-grow-clip"
      containerRef={containerRef}
      data={data}
      enterTransition={enterTransition}
      height={height}
      lines={lines}
      margin={margin}
      revealSignature={revealSignature}
      width={width}
      xDataKey={xDataKey}
    >
      {children}
    </TimeSeriesChartInner>
  )
}

export function AreaChart({
  data,
  xDataKey = "date",
  margin: marginProp,
  animationDuration = 1100,
  animationEasing,
  enterTransition,
  revealSignature,
  aspectRatio = "2 / 1",
  className = "",
  children,
}: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const margin = { ...DEFAULT_MARGIN, ...marginProp }

  return (
    <div
      className={cn("relative w-full", className)}
      ref={containerRef}
      style={{ aspectRatio, touchAction: "none" }}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <ChartInner
            animationDuration={animationDuration}
            animationEasing={animationEasing}
            containerRef={containerRef}
            data={data}
            enterTransition={enterTransition}
            height={height}
            margin={margin}
            revealSignature={revealSignature}
            width={width}
            xDataKey={xDataKey}
          >
            {children}
          </ChartInner>
        )}
      </ParentSize>
    </div>
  )
}

export { Area, type AreaProps } from "./area"

export default AreaChart
