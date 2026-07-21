"use client"

import type {
  SankeyLink as SankeyLinkType,
  SankeyNode as SankeyNodeType,
} from "d3-sankey"
import { motion, useTransform } from "motion/react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useMountProgress } from "../use-mount-progress"
import {
  type SankeyLinkDatum,
  type SankeyNodeDatum,
  useSankey,
} from "./sankey-context"

// Helper to get node index from link source/target
type NodeOrIndex = SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum> | number

function getNodeIndex(nodeOrIndex: NodeOrIndex): number | undefined {
  if (typeof nodeOrIndex === "number") {
    return nodeOrIndex
  }
  return nodeOrIndex.index
}

function getNodeObject(
  nodeOrIndex: NodeOrIndex
): SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum> | null {
  if (typeof nodeOrIndex === "number") {
    return null
  }
  return nodeOrIndex
}

// Default node color palette using CSS variables
const defaultColors = [
  "var(--chart-line-primary)",
  "var(--chart-line-secondary)",
  "color-mix(in oklab, var(--chart-line-primary) 78%, white)",
  "color-mix(in oklab, var(--chart-line-secondary) 72%, white)",
  "color-mix(in oklab, var(--chart-line-primary) 62%, white)",
]

function getDefaultNodeColor(
  node: SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum>
): string {
  const index = node.index ?? 0
  return (
    defaultColors[index % defaultColors.length] ?? "var(--chart-line-primary)"
  )
}

export interface SankeyLinkProps {
  /** Opacity when another link/node is hovered. Default: 0.1 */
  fadedOpacity?: number
  /** Custom link color function (overrides gradient) */
  getLinkColor?: (
    link: SankeyLinkType<SankeyNodeDatum, SankeyLinkDatum>,
    index: number
  ) => string
  /** Return pattern ID for a link, or null/undefined to use gradient/solid color */
  getLinkPattern?: (
    link: SankeyLinkType<SankeyNodeDatum, SankeyLinkDatum>,
    index: number
  ) => string | null | undefined
  /** Custom function to get node color (for gradient) */
  getNodeColor?: (
    node: SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum>,
    index: number
  ) => string
  /** Pattern definitions to render in defs. Use @visx/pattern components (PatternLines, PatternCircles, etc.) */
  patterns?: React.ReactNode
  /** Stroke color for links (overrides gradient). Default: uses gradient */
  stroke?: string
  /** Stroke opacity. Default: 0.5 */
  strokeOpacity?: number
  /** Use gradient from source to target color. Default: true */
  useGradient?: boolean
}

interface AnimatedLinkProps {
  animationDuration: number
  fadedOpacity: number
  index: number
  isFaded: boolean
  isHighlighted: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  path: string
  stroke: string
  strokeOpacity: number
  totalLinks: number
  width: number
}

function AnimatedLink({
  path,
  width,
  stroke,
  strokeOpacity,
  index,
  totalLinks,
  isFaded,
  isHighlighted,
  fadedOpacity,
  animationDuration,
  onMouseEnter,
  onMouseLeave,
}: AnimatedLinkProps) {
  const { enterTransition, revealEpoch } = useSankey()
  const pathRef = useRef<SVGPathElement>(null)
  const [pathLength, setPathLength] = useState(0)

  // Links animate during the last 80% of total duration, starting at 20%
  const linkStartDelay = animationDuration * 0.2
  const linkAnimDuration = animationDuration * 0.8
  const staggerDelaySeconds =
    (linkStartDelay + (index / totalLinks) * linkAnimDuration * 0.4) / 1000

  useLayoutEffect(() => {
    if (pathRef.current) {
      const length = pathRef.current.getTotalLength()
      setPathLength(length)
    }
  })

  const progress = useMountProgress(
    enterTransition,
    staggerDelaySeconds,
    `${revealEpoch}-${index}`
  )
  const strokeDashoffset = useTransform(progress, [0, 1], [pathLength, 0])

  // Calculate target opacity
  const getTargetOpacity = () => {
    if (isFaded) {
      return fadedOpacity
    }
    if (isHighlighted) {
      return Math.min(1, strokeOpacity * 1.3)
    }
    return strokeOpacity
  }
  const targetOpacity = getTargetOpacity()

  // Dasharray for path reveal
  const dashArray = pathLength > 0 ? `${pathLength} ${pathLength}` : "none"

  // Ensure opacity values are always numbers
  const initialOpacity = strokeOpacity ?? 0.5
  const animatedOpacity = targetOpacity ?? initialOpacity

  return (
    <motion.path
      animate={{ opacity: animatedOpacity }}
      d={path}
      fill="none"
      initial={{ opacity: initialOpacity }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={pathRef}
      stroke={stroke}
      strokeDasharray={dashArray}
      strokeWidth={Math.max(1, width)}
      style={{
        cursor: "pointer",
        strokeDashoffset,
      }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    />
  )
}

export function SankeyLink({
  stroke,
  strokeOpacity = 0.5,
  fadedOpacity = 0.1,
  useGradient = true,
  getNodeColor,
  getLinkColor,
  patterns,
  getLinkPattern,
}: SankeyLinkProps) {
  const {
    links,
    hoveredNodeIndex,
    hoveredLinkIndex,
    setHoveredLinkIndex,
    setTooltipData,
    animationDuration,
    createPath,
  } = useSankey()

  // Get color for a node (for gradients)
  const getNodeColorFn = useCallback(
    (node: SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum>): string => {
      if (getNodeColor) {
        return getNodeColor(node, node.index ?? 0)
      }
      return getDefaultNodeColor(node)
    },
    [getNodeColor]
  )

  // Get color for a link (solid color, when not using gradient)
  const getLinkColorFn = useCallback(
    (link: SankeyLinkType<SankeyNodeDatum, SankeyLinkDatum>, index: number) => {
      if (getLinkColor) {
        return getLinkColor(link, index)
      }
      return stroke || "var(--chart-line-primary)"
    },
    [getLinkColor, stroke]
  )

  // Check if any element is hovered
  const isAnyHovered = hoveredNodeIndex !== null || hoveredLinkIndex !== null

  // Build gradient definitions for all links
  const gradientDefs = useMemo(() => {
    if (!useGradient || stroke || getLinkColor) {
      return null
    }

    return links.map((link, index) => {
      const sourceNode = getNodeObject(link.source as NodeOrIndex)
      const targetNode = getNodeObject(link.target as NodeOrIndex)

      // Always define a gradient so `url(#...)` never points to a missing id.
      // Use fallback colors if nodes can't be resolved
      const sourceColor = sourceNode
        ? getNodeColorFn(sourceNode)
        : "var(--chart-line-primary)"
      const targetColor = targetNode
        ? getNodeColorFn(targetNode)
        : "var(--chart-line-secondary)"
      const gradientId = `link-gradient-${index}`

      // Get absolute x positions for gradient
      // Use userSpaceOnUse to avoid issues with horizontal links (where bounding box has zero height)
      const x1 = sourceNode?.x1 ?? 0
      const x2 = targetNode?.x0 ?? 100

      return (
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          key={gradientId}
          x1={x1}
          x2={x2}
          y1="0"
          y2="0"
        >
          <stop offset="0%" stopColor={sourceColor} stopOpacity={1} />
          <stop offset="100%" stopColor={targetColor} stopOpacity={1} />
        </linearGradient>
      )
    })
  }, [links, useGradient, stroke, getLinkColor, getNodeColorFn])

  return (
    <g className="sankey-links">
      {/* Pattern and gradient definitions */}
      <defs>
        {patterns}
        {gradientDefs}
      </defs>

      {/* Links */}
      {links.map((link, index) => {
        const path = createPath(link)
        const linkWidth = link.width ?? 1

        // Skip if path is empty
        if (!path || path.trim() === "") {
          return null
        }

        const sIdx = getNodeIndex(link.source as NodeOrIndex)
        const tIdx = getNodeIndex(link.target as NodeOrIndex)

        // Use fallback indices if we can't resolve
        const sourceIdx =
          sIdx ?? (typeof link.source === "number" ? link.source : -1)
        const targetIdx =
          tIdx ?? (typeof link.target === "number" ? link.target : -1)

        const isHighlighted =
          hoveredLinkIndex === index ||
          hoveredNodeIndex === sourceIdx ||
          hoveredNodeIndex === targetIdx
        const isFaded = isAnyHovered && !isHighlighted

        const handleMouseEnter = () => {
          setHoveredLinkIndex(index)
          setTooltipData({
            data: link,
            linkIndex: index,
            type: "link",
            x: 0,
            y: 0,
          })
        }

        const handleMouseLeave = () => {
          setHoveredLinkIndex(null)
          setTooltipData(null)
        }

        // Determine stroke color (pattern URL, gradient URL, or solid color)
        let linkStroke: string
        const patternId = getLinkPattern?.(link, index)
        if (patternId) {
          // Use pattern fill
          linkStroke = `url(#${patternId})`
        } else if (useGradient && !stroke && !getLinkColor) {
          // Use gradient
          linkStroke = `url(#link-gradient-${index})`
        } else {
          linkStroke = getLinkColorFn(link, index)
        }

        return (
          <AnimatedLink
            animationDuration={animationDuration}
            fadedOpacity={fadedOpacity}
            index={index}
            isFaded={isFaded}
            isHighlighted={isHighlighted}
            key={`link-${sourceIdx}-${targetIdx}-${link.width ?? link.value ?? ""}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            path={path}
            stroke={linkStroke}
            strokeOpacity={strokeOpacity}
            totalLinks={links.length}
            width={linkWidth}
          />
        )
      })}
    </g>
  )
}

SankeyLink.displayName = "SankeyLink"

export default SankeyLink
