"use client"

import {
  IconBook2,
  IconBuildingBank,
  IconChartBar,
  IconCode,
  IconCopy,
  IconKey,
  IconLayoutDashboard,
  IconLogout2,
  IconPlane,
  IconRipple,
  IconTopologyStar3,
  IconUsersGroup,
  IconPipeline,
  type TablerIcon,
  IconUsers,
  IconSparkle2,
} from "@tabler/icons-react"
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
  { title: "Catalog", href: "/catalog", icon: IconBook2 },
  { title: "Permissions", href: "/permissions", icon: IconKey },
  { title: "Teams", href: "/teams", icon: IconUsers },
  { title: "SQL Editor", href: "/editor", icon: IconCode },
  { title: "Pipelines", href: "/pipelines", icon: IconPipeline },
  { title: "Agent", href: "/analytics", icon: IconSparkle2 },
  { title: "Dashboard", href: "/dashboard", icon: IconChartBar },
]

const appItems = [
  {
    title: "VietJet Air Booking",
    href: "/apps/vietjetair-booking",
    icon: IconPlane,
  },
  {
    title: "HDBank Transfer",
    href: "/apps/hdbank",
    icon: IconBuildingBank,
  },
]

type NavItem = {
  title: string
  href: string
  icon: TablerIcon
}

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
        <div className="flex items-center gap-2 mx-1">
          <IconRipple size={16} className="shrink-0" />
          <span className="text-sm font-semibold tracking-tight truncate group-data-[collapsible=icon]:hidden">
            Mizumi
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item: NavItem) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon size={16} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Synthetics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {appItems.map((item: NavItem) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon size={16} />
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
              <IconCopy size={16} />
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
              <IconLogout2 size={16} />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
