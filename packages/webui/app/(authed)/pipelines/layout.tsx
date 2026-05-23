"use client"

import {
  IconAsset,
  IconCalendarEvent,
  IconListDetails,
  IconTimeline,
  IconWaveSine,
  type TablerIcon,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Assets", href: "/pipelines/assets", icon: IconAsset },
  { label: "Runs", href: "/pipelines/runs", icon: IconListDetails },
  {
    label: "Schedules",
    href: "/pipelines/schedules",
    icon: IconCalendarEvent,
  },
  { label: "Streaming", href: "/pipelines/streaming", icon: IconWaveSine },
  { label: "Lineage", href: "/pipelines/lineage", icon: IconTimeline },
] as const satisfies ReadonlyArray<{
  label: string
  href: string
  icon: TablerIcon
}>

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
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors",
              pathname === t.href || pathname.startsWith(`${t.href}/`)
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon size={12} />
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
