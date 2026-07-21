import { redirect } from "next/navigation"
import { HoleBackground } from "@/components/animate-ui/components/backgrounds/hole"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { getServerSession } from "@/lib/auth"
import { signInWithKeycloak } from "@/lib/auth/actions"

interface LoginPageProps {
  searchParams: Promise<{
    next?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession()
  const { next } = await searchParams

  if (session) {
    redirect("/")
  }

  return (
    <HoleBackground className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative z-50 w-full max-w-md rounded-3xl border border-emerald-950/10 bg-white/88 p-6 shadow-[0_24px_80px_rgba(34,84,61,0.18)] backdrop-blur">
        <div className="mb-8 space-y-3">
          <Badge
            className="border-emerald-900/10 bg-emerald-50 text-emerald-900/75"
            variant="outline"
          >
            Mizumi Platform
          </Badge>
          <div className="space-y-1.5">
            <h1 className="font-semibold text-2xl text-emerald-950 tracking-tight">
              Sign in with Keycloak
            </h1>
            <p className="text-emerald-950/70 text-xs leading-5">
              Use your Keycloak account to access the Mizumi control plane,
              query tools, lineage views, and pipeline dashboards.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Status
              className="border-emerald-900/10 bg-white/40 text-emerald-800"
              variant="success"
            >
              <StatusIndicator />
              <StatusLabel>Sign in through the Sovico realm</StatusLabel>
            </Status>
          </div>
          <div className="grid gap-3">
            <form action={signInWithKeycloak}>
              <input name="next" type="hidden" value={next ?? "/"} />
              <Button className="w-full" size="lg" type="submit">
                Continue with Sovico
              </Button>
            </form>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Authentication is handled by the local Keycloak instance and routed
            back into Mizumi after sign-in through the shared Sovico realm.
          </p>
        </div>
      </div>
    </HoleBackground>
  )
}
