"use client"

import { format, formatDistanceToNowStrict } from "date-fns"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  getPolicyTemplate,
  listPermissionRequests,
  type PermissionRequest,
  type PolicyTemplate,
  type RiskLevel,
} from "@/services/permissions"

function getRiskVariant(risk: RiskLevel) {
  switch (risk) {
    case "high":
      return "destructive"
    case "medium":
      return "secondary"
    default:
      return "outline"
  }
}

function formatScopeLabel(scope: string) {
  return scope[0]?.toUpperCase() + scope.slice(1)
}

function formatApprovalMode(mode: string) {
  if (mode === "auto") return "Auto-approve"
  if (mode === "review") return "Reviewer gate"
  return "Security escalation"
}

function formatResourceLabel(resource: string | null) {
  return resource ?? "Any resource"
}

function formatAbsoluteDate(value: string) {
  return format(new Date(value), "MMM d, yyyy HH:mm")
}

function matchesTemplate(request: PermissionRequest, template: PolicyTemplate) {
  return request.policy_template_id === template.id
}

function formatSubmitter(request: PermissionRequest) {
  return request.submit_as === "team" ? (request.team ?? "Team") : "Personal"
}

export default function PolicyTemplateDetailPage() {
  const params = useParams<{ id: string }>()
  const templateId = typeof params.id === "string" ? params.id : ""
  const [template, setTemplate] = useState<PolicyTemplate | null>(null)
  const [requests, setRequests] = useState<PermissionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!templateId) return
      setLoading(true)
      setError(null)

      try {
        const [templateData, requestData] = await Promise.all([
          getPolicyTemplate(templateId),
          listPermissionRequests(),
        ])

        if (cancelled) return

        setTemplate(templateData)
        setRequests(
          requestData.filter((request) =>
            matchesTemplate(request, templateData),
          ),
        )
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "Failed to load policy template",
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [templateId])

  const recentRequests = useMemo(
    () =>
      [...requests]
        .sort(
          (left, right) =>
            new Date(right.submitted_at).getTime() -
            new Date(left.submitted_at).getTime(),
        )
        .slice(0, 6),
    [requests],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading policy template…
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div>
          <p className="text-sm font-semibold">Template unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error ?? "The policy template could not be found."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/permissions/policy-templates">Back to templates</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-3 py-2 shrink-0">
        <div className="min-w-0">
          <Link
            href="/permissions/policy-templates"
            className="text-xs text-muted-foreground hover:underline"
          >
            Back to policy templates
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <h1 className="text-sm font-semibold">{template.name}</h1>
            <Badge variant="outline">{formatScopeLabel(template.scope)}</Badge>
            <Badge variant={getRiskVariant(template.risk)}>
              {template.risk} risk
            </Badge>
            <Badge variant="outline">
              {formatApprovalMode(template.approval_mode)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {template.owner} owns this reusable access path for{" "}
            <span className="font-mono">
              {formatResourceLabel(template.resource)}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="space-y-3">
            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Template summary</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Scope, owner, update cadence, and usage footprint.
                </p>
              </div>
              <Separator />
              <div className="grid gap-x-4 gap-y-3 px-3 py-3 md:grid-cols-2">
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Owner
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {template.owner}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Resource target
                    </p>
                    <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                      {formatResourceLabel(template.resource)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Approval mode
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatApprovalMode(template.approval_mode)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Updated
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatAbsoluteDate(template.last_updated)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNowStrict(
                        new Date(template.last_updated),
                        {
                          addSuffix: true,
                        },
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Usage
                    </p>
                    <p className="mt-0.5 text-sm">
                      {template.usage_30d} request
                      {template.usage_30d === 1 ? "" : "s"} in the last 30 days
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Matched requests in queue
                    </p>
                    <p className="mt-0.5 text-sm">{requests.length}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Access envelope</h2>
              </div>
              <Separator />
              <div className="space-y-3 px-3 py-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Eligible teams
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {template.teams.map((team) => (
                        <Badge key={team} variant="outline">
                          {team}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Allowed privileges
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {template.privileges.map((privilege) => (
                        <Badge key={privilege} variant="outline">
                          {privilege}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">
                  Recent matched requests
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Requests currently carrying this template in the queue.
                </p>
              </div>
              <Separator />
              <div className="px-3 py-3">
                {recentRequests.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentRequests.map((request) => (
                      <Link
                        key={request.id}
                        href={`/permissions/${request.id}`}
                        className="block rounded-md border px-3 py-2 transition-colors hover:bg-accent/30"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">
                                {request.code}
                              </span>
                              <Badge variant="outline">{request.status}</Badge>
                              <Badge variant="outline">
                                {formatSubmitter(request)}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {request.requester} ·{" "}
                              <span className="font-mono">
                                {request.resource}
                              </span>
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNowStrict(
                              new Date(request.submitted_at),
                              {
                                addSuffix: true,
                              },
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No current permission requests are matched to this template.
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-3">
            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Approval flow</h2>
              </div>
              <Separator />
              <div className="px-3 py-3">
                {template.approval_steps.length > 0 ? (
                  <div className="space-y-1.5">
                    {template.approval_steps.map((step) => (
                      <div key={step.id} className="rounded-md border px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">
                            {`Stage ${step.stage_order} · ${step.approver_team}`}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {step.approver_label || "Approval required"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This template does not define explicit approval steps. Its
                    approval mode is handled directly.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Design intent</h2>
              </div>
              <Separator />
              <div className="space-y-2.5 px-3 py-3 text-sm text-muted-foreground">
                <p>
                  This template standardizes a recurring access path so teams
                  can request a known privilege set without manual policy
                  assembly.
                </p>
                <p>
                  The template currently applies to {template.teams.length}{" "}
                  eligible team{template.teams.length === 1 ? "" : "s"} and
                  exposes {template.privileges.length} allowed privilege
                  {template.privileges.length === 1 ? "" : "s"}.
                </p>
                <p>
                  {template.approval_mode === "auto"
                    ? "Requests matching this template can be granted automatically when the full envelope matches."
                    : "Requests matching this template will still enter review, but with a pre-defined approver chain and risk posture."}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
