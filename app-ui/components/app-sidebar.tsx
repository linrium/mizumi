'use client'

import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Database01Icon,
  CatalogueIcon,
  WorkflowCircle01Icon,
  Chart01Icon,
  Setting06Icon,
  DashboardSquare01Icon,
} from '@hugeicons/core-free-icons'

const navItems = [
  { title: 'Catalog', href: '/catalog', icon: CatalogueIcon },
  { title: 'SQL Editor', href: '/editor', icon: Database01Icon },
  { title: 'Pipelines', href: '/pipelines', icon: WorkflowCircle01Icon },
  { title: 'Analytics', href: '/analytics', icon: Chart01Icon },
  { title: 'Dashboard', href: '/dashboard', icon: DashboardSquare01Icon },
  { title: 'Settings', href: '/settings', icon: Setting06Icon },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <span className="text-sm font-semibold tracking-tight truncate group-data-[collapsible=icon]:hidden">
          Mizumi
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={pathname.startsWith(item.href)}>
                    <a href={item.href}>
                      <HugeiconsIcon icon={item.icon} size={16} />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
