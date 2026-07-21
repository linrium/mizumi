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
    href: "/permissions",
    icon: IconListDetails,
    label: "Request Queue",
  },
  {
    href: "/permissions/policy-templates",
    icon: IconTemplate,
    label: "Policy Templates",
  },
  {
    href: "/permissions/blast-radius-preview",
    icon: IconChartBubble,
    label: "Blast-Radius Preview",
  },
  {
    href: "/permissions/time-bound-access",
    icon: IconClockShield,
    label: "Time-Bound Access",
  },
] as const satisfies ReadonlyArray<{
  label: string
  href: string
  icon: TablerIcon
}>

const PERMISSIONS_ROOT_RE = /^\/permissions\/[^/]+$/

export default function PermissionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const nestedTabPaths = TABS.filter((tab) => tab.href !== "/permissions").map(
    (tab) => tab.href
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-0 overflow-x-auto border-b px-3">
        {TABS.map((tab) => {
          const isPermissionsRoot =
            pathname === "/permissions" ||
            (PERMISSIONS_ROOT_RE.test(pathname) &&
              !nestedTabPaths.some(
                (nestedPath) =>
                  pathname === nestedPath ||
                  pathname.startsWith(`${nestedPath}/`)
              ))
          const isActive =
            tab.href === "/permissions"
              ? isPermissionsRoot
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)

          return (
            <Link
              className={cn(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-medium text-xs transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              href={tab.href}
              key={tab.href}
            >
              <tab.icon size={12} />
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
