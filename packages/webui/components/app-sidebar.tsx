"use client"

import {
  IconArrowBarLeft,
  IconArrowBarRight,
  IconBoxModel,
  IconBuildingBank,
  IconChartBar,
  IconCode,
  IconCopy,
  IconFlask,
  IconLogout2,
  IconLuggage,
  IconPipeline,
  IconPlane,
  IconRipple,
  IconShield,
  IconSparkle2,
  IconTriangleSquareCircle,
  IconUsers,
  type TablerIcon,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { startTransition } from "react"
import { toast } from "sonner"
import { SessionSelector } from "@/components/session-selector"
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth/actions"
import type { AppSession } from "@/lib/auth/types"

const navItems = [
  { href: "/catalog", icon: IconTriangleSquareCircle, title: "Catalog" },
  { href: "/permissions", icon: IconShield, title: "Governance" },
  { href: "/teams", icon: IconUsers, title: "Teams" },
  { href: "/editor", icon: IconCode, title: "SQL Editor" },
  { href: "/pipelines", icon: IconPipeline, title: "Pipelines" },
  { href: "/model-registry", icon: IconBoxModel, title: "Model Registry" },
  { href: "/experiments", icon: IconFlask, title: "Experiments" },
  { href: "/analytics", icon: IconSparkle2, title: "Agent" },
  { href: "/dashboard", icon: IconChartBar, title: "Dashboard" },
]

const appItems = [
  {
    href: "/apps/vietjetair-booking",
    icon: IconPlane,
    title: "VietJet Air Booking",
  },
  {
    href: "/apps/vietjetair-baggage-model",
    icon: IconLuggage,
    title: "Baggage Model",
  },
  {
    href: "/apps/hdbank",
    icon: IconBuildingBank,
    title: "HDBank Transfer",
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
  const { state } = useSidebar()
  const groupsLabel = session.groups?.join(", ")
  const isCollapsed = state === "collapsed"
  const TriggerIcon = isCollapsed ? IconArrowBarRight : IconArrowBarLeft

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
      <SidebarHeader className="py-3">
        <div className="flex items-center">
          {isCollapsed ? (
            <SidebarTrigger
              aria-label="Expand sidebar"
              className="mx-auto size-8 [&_svg]:size-4"
              title="Expand sidebar"
            >
              <TriggerIcon size={16} />
            </SidebarTrigger>
          ) : (
            <>
              <div className="mx-1 flex min-w-0 items-center gap-2">
                <IconRipple className="shrink-0" size={16} />
                <span className="truncate font-semibold text-sm tracking-tight">
                  Mizumi
                </span>
              </div>
              <SidebarTrigger
                aria-label="Collapse sidebar"
                className="ml-auto size-8 [&_svg]:size-4"
                title="Collapse sidebar"
              >
                <TriggerIcon size={16} />
              </SidebarTrigger>
            </>
          )}
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
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
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
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
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
        {isCollapsed ? null : (
          <div className="pt-2">
            <SessionSelector />
          </div>
        )}
        <div className="rounded-md border border-sidebar-border/70 bg-sidebar-accent/30 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="truncate font-medium text-xs">
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
              onClick={() => {
                startTransition(() => {
                  void signOut()
                })
              }}
              tooltip="Log out"
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
