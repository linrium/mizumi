"use client"

import NumberFlow from "@number-flow/react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Subset of `Intl.NumberFormatOptions` supported by NumberFlow */
export interface ChartStatFlowFormat {
  compactDisplay?: "short" | "long"
  currency?: string
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name"
  maximumFractionDigits?: number
  maximumSignificantDigits?: number
  minimumFractionDigits?: number
  minimumIntegerDigits?: number
  minimumSignificantDigits?: number
  notation?: "standard" | "compact"
  style?: "decimal" | "percent" | "currency"
  unit?: string
  unitDisplay?: "short" | "long" | "narrow"
}

export const defaultChartStatFlowFormat: ChartStatFlowFormat = {
  maximumFractionDigits: 0,
  notation: "standard",
}

export interface ChartStatFlowProps {
  formatOptions?: ChartStatFlowFormat
  icon?: ReactNode
  label: string
  labelClassName?: string
  prefix?: string
  suffix?: string
  value: number
  valueClassName?: string
}

/**
 * Shared value + label stack using NumberFlow (same layout as pie / ring centers).
 * Parent should provide flex alignment and sizing when needed.
 */
export function ChartStatFlow({
  value,
  label,
  formatOptions = defaultChartStatFlowFormat,
  prefix,
  suffix,
  valueClassName = "text-2xl font-bold",
  labelClassName = "text-xs",
  icon,
}: ChartStatFlowProps) {
  return (
    <>
      {icon ? (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
          {icon}
        </div>
      ) : null}
      <span className={cn("text-foreground tabular-nums", valueClassName)}>
        <NumberFlow
          format={formatOptions}
          prefix={prefix}
          suffix={suffix}
          value={value}
          willChange
        />
      </span>
      <span className={cn("mt-0.5 text-chart-label", labelClassName)}>
        {label}
      </span>
    </>
  )
}

ChartStatFlow.displayName = "ChartStatFlow"
