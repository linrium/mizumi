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
          <SidebarInset className="flex flex-col h-full overflow-hidden">
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </SessionProvider>
    </TooltipProvider>
  )
}
