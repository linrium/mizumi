import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { getServerSession } from "@/lib/auth/server";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession();

  if (session) {
    redirect("/");
  }

  const { next } = await searchParams;
  const loginHref = next
    ? `/auth/login?next=${encodeURIComponent(next)}`
    : "/auth/login";

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,oklch(0.97_0.11_126)_0%,transparent_28%),linear-gradient(180deg,oklch(0.995_0.01_120)_0%,oklch(0.98_0.02_130)_45%,oklch(0.955_0.03_135)_100%)] px-6 py-16">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(18,56,32,0.04)_35%,transparent_70%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-emerald-950/10 bg-white/88 p-8 shadow-[0_24px_80px_rgba(34,84,61,0.18)] backdrop-blur">
        <div className="mb-10 space-y-4">
          <Badge
            variant="outline"
            className="h-auto rounded-full border-emerald-900/10 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-900/75"
          >
            Mizumi Platform
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-emerald-950">
              Sign in with Keycloak
            </h1>
            <p className="text-sm leading-6 text-emerald-950/70">
              Use your Keycloak account to access the Mizumi control plane,
              query tools, lineage views, and pipeline dashboards.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 p-4">
            <Status
              variant="success"
              className="border-none bg-transparent px-0 py-0 text-emerald-800"
            >
              <StatusIndicator />
              <StatusLabel>
                Keycloak realm is configured for local sign-in
              </StatusLabel>
            </Status>
            <Separator className="my-3 bg-emerald-950/10" />
            <div className="flex items-center justify-between text-xs text-emerald-950/75">
              <span className="uppercase tracking-[0.18em]">Realm</span>
              <Badge variant="secondary" className="font-mono">
                mizumi
              </Badge>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="h-11 w-full rounded-xl text-sm font-semibold"
          >
            <a href={loginHref}>Continue to Keycloak</a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Authentication is handled by the local Keycloak instance and routed
            back into Mizumi after sign-in.
          </p>
        </div>
      </div>
    </div>
  );
}
