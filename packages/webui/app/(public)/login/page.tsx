import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { getServerSession } from "@/lib/auth"
import { signInWithKeycloak } from "@/lib/auth/actions"
import { HoleBackground } from "@/components/animate-ui/components/backgrounds/hole"

type LoginPageProps = {
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
      <div className="z-50 relative w-full max-w-md rounded-3xl border border-emerald-950/10 bg-white/88 p-6 shadow-[0_24px_80px_rgba(34,84,61,0.18)] backdrop-blur">
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
            <form action={signInWithKeycloak}>
              <input type="hidden" name="next" value={next ?? "/"} />
              <Button size="lg" className="w-full" type="submit">
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
