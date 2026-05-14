"use client"

import type { SecurityIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { cn } from "@/lib/utils"

type Tab = {
  href: string
  label: string
  active: boolean
  icon?: typeof SecurityIcon
}

export function CatalogTabs({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="mt-3 flex items-center gap-0 border-b -mx-6 px-6">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-3 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors",
            tab.active
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.icon && <HugeiconsIcon icon={tab.icon} size={12} />}
            {tab.label}
          </span>
        </Link>
      ))}
    </div>
  )
}
