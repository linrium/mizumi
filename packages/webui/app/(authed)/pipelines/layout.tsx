"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Assets", href: "/pipelines/assets" },
  { label: "Runs", href: "/pipelines/runs" },
  { label: "Schedules", href: "/pipelines/schedules" },
  { label: "Streaming", href: "/pipelines/streaming" },
  { label: "Lineage", href: "/pipelines/lineage" },
]

export default function PipelinesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-0 border-b shrink-0 px-3">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors",
              pathname === t.href || pathname.startsWith(t.href + "/")
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
