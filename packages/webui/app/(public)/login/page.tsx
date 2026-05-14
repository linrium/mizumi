import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { getServerSessionResult } from "@/lib/auth/server"

type LoginPageProps = {
  searchParams: Promise<{
    next?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { session, sealedValue } = await getServerSessionResult()
  const realm = "sovico"
  const { next } = await searchParams

  if (session && !sealedValue) {
    redirect("/")
  }

  const loginHref = next
    ? `/auth/login?realm=${encodeURIComponent(realm)}&next=${encodeURIComponent(next)}`
    : `/auth/login?realm=${encodeURIComponent(realm)}`

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,oklch(0.97_0.11_126)_0%,transparent_28%),linear-gradient(180deg,oklch(0.995_0.01_120)_0%,oklch(0.98_0.02_130)_45%,oklch(0.955_0.03_135)_100%)] px-6 py-16">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(18,56,32,0.04)_35%,transparent_70%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-emerald-950/10 bg-white/88 p-6 shadow-[0_24px_80px_rgba(34,84,61,0.18)] backdrop-blur">
        <div className="mb-8 space-y-3">
          <Badge
            variant="outline"
            className="border-emerald-900/10 bg-emerald-50 text-emerald-900/75"
          >
            Mizumi Platform
          </Badge>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">
              Sign in with Keycloak
            </h1>
            <p className="text-xs leading-5 text-emerald-950/70">
              Use your Keycloak account to access the Mizumi control plane,
              query tools, lineage views, and pipeline dashboards.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Status
              variant="success"
              className="border-emerald-900/10 bg-white/40 text-emerald-800"
            >
              <StatusIndicator />
              <StatusLabel>Sign in through the Sovico realm</StatusLabel>
            </Status>
          </div>
          <div className="grid gap-3">
            <Button size="lg" asChild className="w-full">
              <a href={loginHref}>Continue with Sovico</a>
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Authentication is handled by the local Keycloak instance and routed
            back into Mizumi after sign-in through the shared Sovico realm.
          </p>
        </div>
      </div>
    </div>
  )
}
