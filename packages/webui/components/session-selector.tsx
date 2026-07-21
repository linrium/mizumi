"use client"

import { IconCpu } from "@tabler/icons-react"

export function SessionSelector() {
  return (
    <div className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-muted-foreground text-xs">
      <span className="size-1.5 rounded-full bg-green-500" />
      <IconCpu size={14} />
      default
    </div>
  )
}
