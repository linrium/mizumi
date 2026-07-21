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
  { href: "/pipelines/assets", icon: IconAsset, label: "Assets" },
  { href: "/pipelines/runs", icon: IconListDetails, label: "Runs" },
  {
    href: "/pipelines/schedules",
    icon: IconCalendarEvent,
    label: "Schedules",
  },
  { href: "/pipelines/streaming", icon: IconWaveSine, label: "Streaming" },
  { href: "/pipelines/lineage", icon: IconTimeline, label: "Lineage" },
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-0 border-b px-3">
        {TABS.map((t) => (
          <Link
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 font-medium text-xs transition-colors",
              pathname === t.href || pathname.startsWith(`${t.href}/`)
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            href={t.href}
            key={t.href}
          >
            <t.icon size={12} />
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
