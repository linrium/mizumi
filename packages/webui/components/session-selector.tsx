"use client"

import { IconCpu } from "@tabler/icons-react"

export function SessionSelector() {
  return (
    <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground">
      <span className="size-1.5 rounded-full bg-green-500" />
      <IconCpu size={14} />
      default
    </div>
  )
}
