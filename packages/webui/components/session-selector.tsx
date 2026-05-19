"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { CpuIcon } from "@hugeicons/core-free-icons"

export function SessionSelector() {
  return (
    <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground">
      <span className="size-1.5 rounded-full bg-green-500" />
      <HugeiconsIcon icon={CpuIcon} size={11} className="text-muted-foreground" />
      default
    </div>
  )
}
