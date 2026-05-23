"use client"

import {
  IconChartBubble,
  IconClockShield,
  IconListDetails,
  IconTemplate,
  type TablerIcon,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  {
    label: "Request Queue",
    href: "/permissions",
    icon: IconListDetails,
  },
  {
    label: "Policy Templates",
    href: "/permissions/policy-templates",
    icon: IconTemplate,
  },
  {
    label: "Blast-Radius Preview",
    href: "/permissions/blast-radius-preview",
    icon: IconChartBubble,
  },
  {
    label: "Time-Bound Access",
    href: "/permissions/time-bound-access",
    icon: IconClockShield,
  },
] as const satisfies ReadonlyArray<{
  label: string
  href: string
  icon: TablerIcon
}>

export default function PermissionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const nestedTabPaths = TABS.filter((tab) => tab.href !== "/permissions").map(
    (tab) => tab.href,
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-0 border-b shrink-0 px-3 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/permissions"
              ? pathname === "/permissions" ||
                (/^\/permissions\/[^/]+$/.test(pathname) &&
                  !nestedTabPaths.some(
                    (nestedPath) =>
                      pathname === nestedPath ||
                      pathname.startsWith(`${nestedPath}/`),
                  ))
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon size={12} />
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
