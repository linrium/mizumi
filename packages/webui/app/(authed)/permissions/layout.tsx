"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Request Queue", href: "/permissions" },
  { label: "Policy Templates", href: "/permissions/policy-templates" },
  {
    label: "Blast-Radius Preview",
    href: "/permissions/blast-radius-preview",
  },
  { label: "Time-Bound Access", href: "/permissions/time-bound-access" },
]

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
                "px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
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
