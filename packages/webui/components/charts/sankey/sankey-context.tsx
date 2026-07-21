"use client"

import type { SankeyGraph, SankeyLink, SankeyNode } from "d3-sankey"
import type { Transition } from "motion/react"
import {
  createContext,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useContext,
} from "react"

export interface Margin {
  bottom: number
  left: number
  right: number
  top: number
}

export interface SankeyNodeDatum {
  category?: "source" | "landing" | "outcome"
  name: string
  [key: string]: unknown
}

export interface SankeyLinkDatum {
  source: number
  target: number
  value: number
  [key: string]: unknown
}

export interface SankeyTooltipData {
  data: SankeyNodeDatum | SankeyLinkDatum
  linkIndex?: number
  nodeIndex?: number
  type: "node" | "link"
  x: number
  y: number
}

export interface SankeyContextValue {
  animationDuration: number
  containerRef: RefObject<HTMLDivElement | null>

  // Link path generator
  createPath: (link: SankeyLink<SankeyNodeDatum, SankeyLinkDatum>) => string
  /** Motion enter transition (spring or cubic-bezier tween). */
  enterTransition?: Transition
  // Layout data
  graph: SankeyGraph<SankeyNodeDatum, SankeyLinkDatum>
  height: number
  hoveredLinkIndex: number | null

  // Hover state
  hoveredNodeIndex: number | null
  innerHeight: number
  innerWidth: number

  // Animation
  isLoaded: boolean
  links: SankeyLink<SankeyNodeDatum, SankeyLinkDatum>[]
  margin: Margin

  // Mouse position for dynamic tooltips
  mousePos: { x: number; y: number } | null
  nodes: SankeyNode<SankeyNodeDatum, SankeyLinkDatum>[]
  /** Increments when enter animation should replay. */
  revealEpoch: number
  setHoveredLinkIndex: (index: number | null) => void
  setHoveredNodeIndex: (index: number | null) => void
  setTooltipData: Dispatch<SetStateAction<SankeyTooltipData | null>>

  // Tooltip
  tooltipData: SankeyTooltipData | null

  // Dimensions
  width: number
}

const SankeyContext = createContext<SankeyContextValue | null>(null)

export function SankeyProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: SankeyContextValue
}) {
  return (
    <SankeyContext.Provider value={value}>{children}</SankeyContext.Provider>
  )
}

export function useSankey(): SankeyContextValue {
  const context = useContext(SankeyContext)
  if (!context) {
    throw new Error("useSankey must be used within a SankeyProvider")
  }
  return context
}

// CSS variables for sankey theming
export const sankeyCssVars = {
  background: "var(--chart-background)",
  foreground: "var(--chart-foreground)",
  linkColor: "var(--chart-foreground-muted, hsl(0, 0%, 50%))",
  nodePrimary: "var(--chart-line-primary)",
  nodeSecondary: "var(--chart-line-secondary)",
}
