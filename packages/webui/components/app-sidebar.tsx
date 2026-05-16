"use client"

import {
  Airplane01Icon,
  BankIcon,
  Book03Icon,
  Chart01Icon,
  CodeIcon,
  Copy01Icon,
  DashboardSquare01Icon,
  Key01Icon,
  LakeIcon,
  Logout03Icon,
  UserMultiple02Icon,
  WorkflowCircle01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { startTransition } from "react"
import { toast } from "sonner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth/actions"
import type { AppSession } from "@/lib/auth/types"

const navItems = [
  { title: "Catalog", href: "/catalog", icon: Book03Icon },
  { title: "Permissions", href: "/permissions", icon: Key01Icon },
  { title: "Teams", href: "/teams", icon: UserMultiple02Icon },
  { title: "SQL Editor", href: "/editor", icon: CodeIcon },
  { title: "Pipelines", href: "/pipelines", icon: WorkflowCircle01Icon },
  { title: "Analytics", href: "/analytics", icon: Chart01Icon },
  { title: "Dashboard", href: "/dashboard", icon: DashboardSquare01Icon },
]

const appItems = [
  {
    title: "VietJet Air Booking",
    href: "/apps/vietjetair-booking",
    icon: Airplane01Icon,
  },
  {
    title: "HDBank Events",
    href: "/apps/hdbank",
    icon: BankIcon,
  },
]

type AppSidebarProps = {
  session: AppSession
}

export function AppSidebar({ session }: AppSidebarProps) {
  const pathname = usePathname()
  const groupsLabel = session.groups?.join(", ")

  async function copyDebugToken() {
    if (!session.idToken) {
      toast.error("No ID token available")
      return
    }

    try {
      await navigator.clipboard.writeText(session.idToken)
      toast.success("Copied ID token")
    } catch {
      toast.error("Failed to copy ID token")
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={LakeIcon} size={18} className="shrink-0" />
          <span className="text-sm font-semibold font-mono tracking-tight truncate group-data-[collapsible=icon]:hidden">
            Mizumi
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <HugeiconsIcon icon={item.icon} size={16} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Apps</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {appItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <HugeiconsIcon icon={item.icon} size={16} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-md border border-sidebar-border/70 bg-sidebar-accent/30 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="truncate text-xs font-medium">
            {session.name ?? session.email ?? session.preferredUsername}
          </div>
          <div className="mt-1 truncate text-[11px] text-sidebar-foreground/70">
            {session.realm}
            {session.email ? ` • ${session.email}` : ""}
          </div>
          {groupsLabel ? (
            <div
              className="mt-1 line-clamp-2 text-[11px] text-sidebar-foreground/70"
              title={groupsLabel}
            >
              {groupsLabel}
            </div>
          ) : null}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={copyDebugToken}
              tooltip="Copy debug token"
            >
              <HugeiconsIcon icon={Copy01Icon} size={16} />
              <span>Copy debug token</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Log out"
              onClick={() => {
                startTransition(() => {
                  void signOut()
                })
              }}
            >
              <HugeiconsIcon icon={Logout03Icon} size={16} />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
