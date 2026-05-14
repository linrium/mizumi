import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SessionSelector } from "@/components/session-selector";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/hooks/use-session-context";
import { getServerSession } from "@/lib/auth/server";

export default async function AuthedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <TooltipProvider>
      <SessionProvider>
        <SidebarProvider className="h-full">
          <AppSidebar session={session} />
          <SidebarInset className="flex flex-col h-full overflow-hidden">
            <header className="flex h-10 items-center gap-2 border-b px-3 shrink-0">
              <SidebarTrigger />
              <div className="flex-1" />
              <SessionSelector />
            </header>
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </SessionProvider>
    </TooltipProvider>
  );
}
