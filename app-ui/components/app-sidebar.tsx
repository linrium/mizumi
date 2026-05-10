'use client'

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
  WorkflowCircle01Icon,
  Chart01Icon,
  Setting06Icon,
} from '@hugeicons/core-free-icons'

const navItems = [
  { title: 'SQL Editor', href: '/editor', icon: Database01Icon },
  { title: 'Pipelines', href: '/pipelines', icon: WorkflowCircle01Icon },
  { title: 'Analytics', href: '/analytics', icon: Chart01Icon },
  { title: 'Settings', href: '/settings', icon: Setting06Icon },
]

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-base font-semibold tracking-tight">Mizumi</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
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
