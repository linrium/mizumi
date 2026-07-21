import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SessionProvider } from "@/hooks/use-session-context"
import { getServerSession } from "@/lib/auth"

export default async function AuthedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <TooltipProvider>
      <SessionProvider>
        <SidebarProvider className="h-full">
          <AppSidebar session={session} />
          <SidebarInset className="flex h-full flex-col overflow-hidden">
            <main className="min-h-0 flex-1 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </SessionProvider>
    </TooltipProvider>
  )
}
