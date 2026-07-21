"use client"

import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { pie as d3Pie } from "d3-shape"
import type { Transition } from "motion/react"
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"
import {
  defaultPieColors,
  type PieArcData,
  type PieContextValue,
  type PieData,
  PieProvider,
} from "./pie-context"

/** Default hover offset in pixels */
export const DEFAULT_HOVER_OFFSET = 10

export interface PieChartProps {
  /** Child components (PieSlice, PieCenter, patterns, gradients, etc.) */
  children: ReactNode
  /** Additional class name for the container */
  className?: string
  /** Corner radius for rounded slice edges. Default: 0 */
  cornerRadius?: number
  /** Data array - each item represents a slice */
  data: PieData[]
  /** End angle in radians. Default: 3*PI/2 (full circle from top) */
  endAngle?: number
  /** Scales slice stagger delays (1 = default). */
  enterStaggerScale?: number
  /** Framer Motion transition for slice enter animation */
  enterTransition?: Transition
  /** Controlled hover state - index of hovered slice */
  hoveredIndex?: number | null
  /**
   * Hover offset in pixels for slice hover effects.
   * This also determines the padding around the chart to prevent clipping.
   * Default: 10
   */
  hoverOffset?: number
  /** Inner radius for donut charts. Default: 0 (solid pie) */
  innerRadius?: number
  /** Callback when hover state changes */
  onHoverChange?: (index: number | null) => void
  /** Padding angle between slices in radians. Default: 0 */
  padAngle?: number
  /** Chart size in pixels. If not provided, uses parent container size */
  size?: number
  /** Start angle in radians. Default: -PI/2 (top) */
  startAngle?: number
}

interface PieChartInnerProps {
  children: ReactNode
  containerRef: React.RefObject<HTMLDivElement | null>
  cornerRadius: number
  data: PieData[]
  endAngle: number
  enterStaggerScale: number
  enterTransition?: Transition
  height: number
  hoveredIndexProp?: number | null
  hoverOffset: number
  innerRadius: number
  onHoverChange?: (index: number | null) => void
  padAngle: number
  startAngle: number
  width: number
}

// Helper to check if a child is a PieCenter component
function isPieCenter(child: ReactNode): boolean {
  return (
    isValidElement(child) &&
    typeof child.type === "function" &&
    ((child.type as { displayName?: string }).displayName === "PieCenter" ||
      (child.type as { name?: string }).name === "PieCenter")
  )
}

// Helper to check if a component is a gradient or pattern definition
function isDefsComponent(child: ReactElement): boolean {
  const displayName =
    (child.type as { displayName?: string })?.displayName ||
    (child.type as { name?: string })?.name ||
    ""
  return (
    displayName.includes("Gradient") ||
    displayName.includes("Pattern") ||
    displayName === "LinearGradient" ||
    displayName === "RadialGradient"
  )
}

function PieChartInner({
  width,
  height,
  data,
  innerRadius: innerRadiusProp,
  padAngle,
  cornerRadius,
  startAngle,
  endAngle,
  hoverOffset,
  children,
  containerRef,
  hoveredIndexProp,
  onHoverChange,
  enterTransition,
  enterStaggerScale,
}: PieChartInnerProps) {
  const [internalHoveredIndex, setInternalHoveredIndex] = useState<
    number | null
  >(null)
  const [animationKey] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  // Use controlled or uncontrolled hover state
  const isControlled = hoveredIndexProp !== undefined
  const hoveredIndex = isControlled ? hoveredIndexProp : internalHoveredIndex
  const setHoveredIndex = useCallback(
    (index: number | null) => {
      if (isControlled) {
        onHoverChange?.(index)
      } else {
        setInternalHoveredIndex(index)
      }
    },
    [isControlled, onHoverChange]
  )

  // Use the smaller dimension to ensure the chart fits
  const size = Math.min(width, height)
  const center = size / 2

  // Calculate radii with padding based on hover offset to prevent clipping
  const padding = hoverOffset
  const outerRadius = center - padding
  const innerRadius = innerRadiusProp

  // Calculate total value
  const totalValue = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data]
  )

  // Get color for a slice index
  const getColor = useCallback(
    (index: number) => {
      const item = data[index]
      if (item?.color) {
        return item.color
      }
      return defaultPieColors[index % defaultPieColors.length] as string
    },
    [data]
  )

  // Get fill for a slice index (supports patterns/gradients)
  const getFill = useCallback(
    (index: number) => {
      const item = data[index]
      // Check for explicit fill (pattern/gradient URL)
      if (item?.fill) {
        return item.fill
      }
      // Fall back to color
      return getColor(index)
    },
    [data, getColor]
  )

  // Compute arcs using d3-shape pie
  const arcs = useMemo(() => {
    const pieGenerator = d3Pie<PieData>()
      .value((d) => d.value)
      .startAngle(startAngle)
      .endAngle(endAngle)
      .padAngle(padAngle)
      .sort(null) // Maintain data order

    const computed = pieGenerator(data)

    return computed.map((arc, index) => ({
      data: arc.data,
      endAngle: arc.endAngle,
      index,
      padAngle: arc.padAngle,
      startAngle: arc.startAngle,
      value: arc.value,
    })) as PieArcData[]
  }, [data, startAngle, endAngle, padAngle])

  // Mark as loaded after initial render
  useState(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 100)
    return () => clearTimeout(timer)
  })

  // Separate children into categories
  const { svgChildren, centerChildren, defsChildren } = useMemo(() => {
    const svgNodes: ReactNode[] = []
    const centerNodes: ReactNode[] = []
    const defsNodes: ReactElement[] = []

    Children.forEach(children, (child) => {
      if (!isValidElement(child)) {
        svgNodes.push(child)
        return
      }

      if (isPieCenter(child)) {
        centerNodes.push(child)
      } else if (isDefsComponent(child)) {
        defsNodes.push(child)
      } else {
        svgNodes.push(child)
      }
    })

    return {
      centerChildren: centerNodes,
      defsChildren: defsNodes,
      svgChildren: svgNodes,
    }
  }, [children])

  // Early return if dimensions not ready
  if (size < 10) {
    return null
  }

  const contextValue: PieContextValue = {
    animationKey,
    arcs,
    center,
    containerRef,
    cornerRadius,
    data,
    enterStaggerScale,
    enterTransition,
    getColor,
    getFill,
    hoveredIndex,
    hoverOffset,
    innerRadius,
    isLoaded,
    outerRadius,
    padAngle,
    setHoveredIndex,
    size,
    totalValue,
  }

  // Use CSS Grid stacking to layer SVG and HTML content
  // This avoids Safari's foreignObject rendering bugs
  return (
    <PieProvider value={contextValue}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr",
          gridTemplateRows: "1fr",
          height: size,
          width: size,
        }}
      >
        {/* SVG layer with pie slices */}
        <svg
          aria-hidden="true"
          height={size}
          style={{ gridArea: "1 / 1" }}
          width={size}
        >
          {/* Defs for patterns and gradients */}
          {defsChildren.length > 0 && <defs>{defsChildren}</defs>}

          <Group left={center} top={center}>
            {svgChildren}
          </Group>
        </svg>

        {/* HTML layer with center content - stacked on top via grid */}
        {centerChildren.length > 0 && (
          <div
            className="pointer-events-none flex items-center justify-center"
            style={{ gridArea: "1 / 1" }}
          >
            {centerChildren}
          </div>
        )}
      </div>
    </PieProvider>
  )
}

export function PieChart({
  data,
  size: fixedSize,
  innerRadius = 0,
  padAngle = 0,
  cornerRadius = 0,
  startAngle = -Math.PI / 2,
  endAngle = (3 * Math.PI) / 2,
  className = "",
  hoveredIndex,
  onHoverChange,
  hoverOffset = DEFAULT_HOVER_OFFSET,
  enterTransition,
  enterStaggerScale = 1,
  children,
}: PieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // If fixed size is provided, use it directly
  if (fixedSize) {
    return (
      <div
        className={cn("relative flex items-center justify-center", className)}
        ref={containerRef}
        style={{ height: fixedSize, width: fixedSize }}
      >
        <PieChartInner
          containerRef={containerRef}
          cornerRadius={cornerRadius}
          data={data}
          endAngle={endAngle}
          enterStaggerScale={enterStaggerScale}
          enterTransition={enterTransition}
          height={fixedSize}
          hoveredIndexProp={hoveredIndex}
          hoverOffset={hoverOffset}
          innerRadius={innerRadius}
          onHoverChange={onHoverChange}
          padAngle={padAngle}
          startAngle={startAngle}
          width={fixedSize}
        >
          {children}
        </PieChartInner>
      </div>
    )
  }

  // Otherwise use ParentSize for responsive sizing
  return (
    <div
      className={cn("relative aspect-square w-full", className)}
      ref={containerRef}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <PieChartInner
            containerRef={containerRef}
            cornerRadius={cornerRadius}
            data={data}
            endAngle={endAngle}
            enterStaggerScale={enterStaggerScale}
            enterTransition={enterTransition}
            height={height}
            hoveredIndexProp={hoveredIndex}
            hoverOffset={hoverOffset}
            innerRadius={innerRadius}
            onHoverChange={onHoverChange}
            padAngle={padAngle}
            startAngle={startAngle}
            width={width}
          >
            {children}
          </PieChartInner>
        )}
      </ParentSize>
    </div>
  )
}

PieChart.displayName = "PieChart"

export default PieChart
