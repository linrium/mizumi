"use client"

import {
  IconArrowBarLeft,
  IconArrowBarRight,
  IconTriangleSquareCircle,
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
  { title: "Catalog", href: "/catalog", icon: IconTriangleSquareCircle },
  { title: "Governance", href: "/permissions", icon: IconShield },
  { title: "Teams", href: "/teams", icon: IconUsers },
  { title: "SQL Editor", href: "/editor", icon: IconCode },
  { title: "Pipelines", href: "/pipelines", icon: IconPipeline },
  { title: "Model Registry", href: "/model-registry", icon: IconBoxModel },
  { title: "Experiments", href: "/experiments", icon: IconFlask },
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
    title: "Baggage Model",
    href: "/apps/vietjetair-baggage-model",
    icon: IconLuggage,
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
              className="mx-auto size-8 [&_svg]:size-4"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <TriggerIcon size={16} />
            </SidebarTrigger>
          ) : (
            <>
              <div className="mx-1 flex min-w-0 items-center gap-2">
                <IconRipple size={16} className="shrink-0" />
                <span className="truncate text-sm font-semibold tracking-tight">
                  Mizumi
                </span>
              </div>
              <SidebarTrigger
                className="ml-auto size-8 [&_svg]:size-4"
                aria-label="Collapse sidebar"
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
        {!isCollapsed ? (
          <div className="pt-2">
            <SessionSelector />
          </div>
        ) : null}
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
