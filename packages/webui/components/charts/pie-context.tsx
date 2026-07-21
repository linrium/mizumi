"use client"

import type { Transition } from "motion/react"
import { createContext, type RefObject, useContext } from "react"

// CSS variable references for pie chart theming
export const pieCssVars = {
  background: "var(--chart-background)",
  foreground: "var(--chart-foreground)",
  foregroundMuted: "var(--chart-foreground-muted)",
  label: "var(--chart-label)",
  // Default slice colors from chart palette
  slice1: "var(--chart-1)",
  slice2: "var(--chart-2)",
  slice3: "var(--chart-3)",
  slice4: "var(--chart-4)",
  slice5: "var(--chart-5)",
}

// Default slice color palette
export const defaultPieColors = [
  pieCssVars.slice1,
  pieCssVars.slice2,
  pieCssVars.slice3,
  pieCssVars.slice4,
  pieCssVars.slice5,
]

export interface PieData {
  /** Optional color override - falls back to palette */
  color?: string
  /** Optional fill override for patterns/gradients (e.g., "url(#patternId)") */
  fill?: string
  /** Display label for the slice */
  label: string
  /** Value for the slice (determines slice size relative to total) */
  value: number
}

/** Arc data computed by visx Pie */
export interface PieArcData {
  data: PieData
  endAngle: number
  index: number
  padAngle: number
  startAngle: number
  value: number
}

export interface PieContextValue {
  // Animation state
  animationKey: number
  arcs: PieArcData[]
  center: number

  // Container ref for portals
  containerRef: RefObject<HTMLDivElement | null>
  cornerRadius: number
  // Data
  data: PieData[]
  enterStaggerScale: number
  enterTransition?: Transition

  // Get color for a slice index
  getColor: (index: number) => string

  // Get fill for a slice index (supports patterns/gradients)
  getFill: (index: number) => string

  // Hover state
  hoveredIndex: number | null

  // Hover effect
  hoverOffset: number
  innerRadius: number
  isLoaded: boolean
  outerRadius: number
  padAngle: number
  setHoveredIndex: (index: number | null) => void

  // Dimensions
  size: number

  // Computed values
  totalValue: number
}

const PieContext = createContext<PieContextValue | null>(null)

export function PieProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: PieContextValue
}) {
  return <PieContext.Provider value={value}>{children}</PieContext.Provider>
}

export function usePie(): PieContextValue {
  const context = useContext(PieContext)
  if (!context) {
    throw new Error(
      "usePie must be used within a PieProvider. " +
        "Make sure your component is wrapped in <PieChart>."
    )
  }
  return context
}

export default PieContext
