"use client"

import type { TablerIcon } from "@tabler/icons-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Tab {
  active: boolean
  href: string
  icon?: TablerIcon
  label: string
}

export function CatalogTabs({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="-mx-6 mt-3 flex items-center gap-0 border-b px-6">
      {tabs.map((tab) => (
        <Link
          className={cn(
            "-mb-px border-b-2 px-3 py-2 font-medium text-xs capitalize transition-colors",
            tab.active
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          href={tab.href}
          key={tab.href}
        >
          <span className="flex items-center gap-1.5">
            {tab.icon ? <tab.icon size={12} /> : null}
            {tab.label}
          </span>
        </Link>
      ))}
    </div>
  )
}
