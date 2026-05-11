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
  CodeIcon,
  Book03Icon,
  WorkflowCircle01Icon,
  Chart01Icon,
  DashboardSquare01Icon,
  LakeIcon,
} from '@hugeicons/core-free-icons'

const navItems = [
  { title: 'Catalog', href: '/catalog', icon: Book03Icon },
  { title: 'SQL Editor', href: '/editor', icon: CodeIcon },
  { title: 'Pipelines', href: '/pipelines', icon: WorkflowCircle01Icon },
  { title: 'Analytics', href: '/analytics', icon: Chart01Icon },
  { title: 'Dashboard', href: '/dashboard', icon: DashboardSquare01Icon },
]

export function AppSidebar() {
  const pathname = usePathname()

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
