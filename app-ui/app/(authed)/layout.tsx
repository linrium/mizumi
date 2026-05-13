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
import { Button } from "@/components/ui/button";
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
          <AppSidebar />
          <SidebarInset className="flex flex-col h-full overflow-hidden">
            <header className="flex h-10 items-center gap-2 border-b px-3 shrink-0">
              <SidebarTrigger />
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <SessionSelector />
                <div className="hidden items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1 sm:flex">
                  <div className="text-right">
                    <div className="text-[11px] font-medium leading-none">
                      {session.name ??
                        session.email ??
                        session.preferredUsername}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-none mt-1">
                      {session.email}
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href="/auth/logout">Log out</a>
                  </Button>
                </div>
              </div>
            </header>
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </SessionProvider>
    </TooltipProvider>
  );
}
