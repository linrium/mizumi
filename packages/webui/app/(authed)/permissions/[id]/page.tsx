"use client"

import { format, formatDistanceToNowStrict } from "date-fns"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { cn } from "@/lib/utils"
import {
  getPermissionRequest,
  listBlastRadius,
  type BlastRadiusPreview,
  type PermissionRequest,
  type RequestStatus,
  type RiskLevel,
  updateRequestStatus,
} from "@/services/permissions"

const CANCELLABLE: RequestStatus[] = ["pending", "ready", "needs-info"]

function getStatusVariant(status: RequestStatus) {
  switch (status) {
    case "approved":
      return "success"
    case "ready":
      return "info"
    case "needs-info":
      return "warning"
    case "cancelled":
      return "error"
    default:
      return "default"
  }
}

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

function formatStatusLabel(status: RequestStatus) {
  switch (status) {
    case "ready":
      return "Grant-ready"
    case "needs-info":
      return "Needs info"
    default:
      return status[0]?.toUpperCase() + status.slice(1)
  }
}

function formatScopeLabel(scope: string) {
  return scope[0]?.toUpperCase() + scope.slice(1)
}

function formatQueueDecision(decision: PermissionRequest["queue_decision"]) {
  switch (decision) {
    case "auto-approved":
      return "Auto-approved by template"
    case "reviewer-gate":
      return "Matched template, routed to reviewer chain"
    case "security-escalation":
      return "Matched template, escalated through security review"
    default:
      return "No template match, manual triage"
  }
}

function formatAbsoluteDate(value: string) {
  return format(new Date(value), "MMM d, yyyy HH:mm")
}

function formatSubmitter(request: PermissionRequest) {
  return request.submit_as === "team" ? (request.team ?? "Team") : "Personal"
}

function formatApprovalStepStatus(status: string) {
  switch (status) {
    case "approved":
      return "Completed"
    case "pending":
      return "In review"
    case "needs-info":
      return "Needs info"
    case "cancelled":
      return "Cancelled"
    default:
      return "Queued"
  }
}

function getApprovalStepDescription(status: string, isCurrent: boolean) {
  if (status === "approved") {
    return "This approval stage has been completed successfully."
  }
  if (status === "needs-info") {
    return "This stage is waiting on the requester to provide more context."
  }
  if (status === "cancelled") {
    return "This stage will not continue because the request was cancelled."
  }
  if (isCurrent || status === "pending") {
    return "Reviewing requested privileges and verifying risk posture."
  }
  return "This approver will be engaged after the current stage completes."
}

function getApprovalStepVariant(status: string, isCurrent: boolean) {
  if (status === "approved") return "success"
  if (status === "needs-info") return "warning"
  if (status === "cancelled") return "error"
  if (isCurrent || status === "pending") return "info"
  return "default"
}

function getApprovalStepPanelClass(status: string, isCurrent: boolean) {
  if (status === "approved") {
    return "border-green-500/20 bg-green-500/[0.06]"
  }
  if (status === "needs-info") {
    return "border-orange-500/20 bg-orange-500/[0.06]"
  }
  if (status === "cancelled") {
    return "border-destructive/20 bg-destructive/[0.06]"
  }
  if (isCurrent || status === "pending") {
    return "border-blue-500/20 bg-blue-500/[0.06] shadow-sm"
  }
  return "border-border/70 bg-muted/30"
}

export default function PermissionRequestDetailPage() {
  const params = useParams<{ id: string }>()
  const requestId = typeof params.id === "string" ? params.id : ""
  const [request, setRequest] = useState<PermissionRequest | null>(null)
  const [blastRadius, setBlastRadius] = useState<BlastRadiusPreview | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioningKey, setActioningKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!requestId) return
      setLoading(true)
      setError(null)

      try {
        const [requestData, previews] = await Promise.all([
          getPermissionRequest(requestId),
          listBlastRadius(),
        ])

        if (cancelled) return

        setRequest(requestData)
        setBlastRadius(
          previews.find((preview) => preview.request_id === requestId) ?? null,
        )
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load permission request",
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
  }, [requestId])

  const currentSteps = useMemo(
    () => request?.approval_steps.filter((step) => step.is_current) ?? [],
    [request],
  )

  async function handleStatusUpdate(
    status: RequestStatus,
    approvalStepId?: string,
  ) {
    if (!request) return

    const key = `${status}:${approvalStepId ?? "request"}`
    setActioningKey(key)
    setError(null)

    try {
      const updated = await updateRequestStatus(
        request.id,
        status,
        approvalStepId,
      )
      setRequest(updated)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update permission request",
      )
    } finally {
      setActioningKey(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading request…
      </div>
    )
  }

  if (error || !request) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div>
          <p className="text-sm font-semibold">Request unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error ?? "The permission request could not be found."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/permissions">Back to queue</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-3 py-2 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/permissions"
              className="text-xs text-muted-foreground hover:underline"
            >
              Back to request queue
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <h1 className="text-sm font-semibold">{request.code}</h1>
              <Status variant={getStatusVariant(request.status)}>
                <StatusIndicator />
                <StatusLabel>{formatStatusLabel(request.status)}</StatusLabel>
              </Status>
              <Badge variant={getRiskVariant(request.risk)}>
                {request.risk} risk
              </Badge>
              <Badge variant="outline">{formatScopeLabel(request.scope)}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {request.requester} submitted this as {formatSubmitter(request)}{" "}
              for <span className="font-mono">{request.resource}</span>.
            </p>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {currentSteps.length <= 1 && currentSteps[0] ? (
              <Button
                size="sm"
                disabled={actioningKey != null}
                onClick={() =>
                  handleStatusUpdate("approved", currentSteps[0]?.id)
                }
              >
                {actioningKey === `approved:${currentSteps[0]?.id}`
                  ? "Approving…"
                  : "Approve current step"}
              </Button>
            ) : (
              currentSteps.map((step) => (
                <Button
                  key={step.id}
                  size="sm"
                  disabled={actioningKey != null}
                  onClick={() => handleStatusUpdate("approved", step.id)}
                >
                  {actioningKey === `approved:${step.id}`
                    ? "Approving…"
                    : `Approve ${step.approver_team}`}
                </Button>
              ))
            )}
            {currentSteps[0] && (
              <Button
                size="sm"
                variant="outline"
                disabled={actioningKey != null}
                onClick={() =>
                  handleStatusUpdate("needs-info", currentSteps[0]?.id)
                }
              >
                {actioningKey === `needs-info:${currentSteps[0]?.id}`
                  ? "Updating…"
                  : "Request more context"}
              </Button>
            )}
            {CANCELLABLE.includes(request.status) && (
              <Button
                size="sm"
                variant="outline"
                disabled={actioningKey != null}
                onClick={() => handleStatusUpdate("cancelled")}
              >
                {actioningKey === "cancelled:request"
                  ? "Cancelling…"
                  : "Cancel request"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="space-y-3">
            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Request summary</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Request details, access scope, and routing context.
                </p>
              </div>
              <Separator />
              <div className="grid gap-x-4 gap-y-3 px-3 py-3 md:grid-cols-2">
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Requester
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {request.requester}
                    </p>
                    {request.requester_email && (
                      <p className="text-xs text-muted-foreground">
                        {request.requester_email}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Submission target
                    </p>
                    <p className="mt-0.5 text-sm">{formatSubmitter(request)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Queue decision
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatQueueDecision(request.queue_decision)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Submitted
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatAbsoluteDate(request.submitted_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNowStrict(
                        new Date(request.submitted_at),
                        {
                          addSuffix: true,
                        },
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Expires
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatAbsoluteDate(request.expires_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.expires_in_days <= 0
                        ? "Expired"
                        : `${request.expires_in_days} day${request.expires_in_days === 1 ? "" : "s"} remaining`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Current reviewer
                    </p>
                    <p className="mt-0.5 text-sm">{request.reviewer}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Access requested</h2>
              </div>
              <Separator />
              <div className="space-y-3 px-3 py-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Resource
                    </p>
                    <p className="mt-0.5 font-mono text-sm break-all">
                      {request.resource}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Privileges
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {request.privileges.map((privilege) => (
                        <Badge key={privilege} variant="outline">
                          {privilege}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Rationale
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {request.rationale || "No rationale provided."}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Approval flow</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Stage-by-stage approver routing for this request.
                </p>
              </div>
              <Separator />
              <div className="px-3 py-3">
                {request.approval_steps.length > 0 ? (
                  <div className="space-y-1.5">
                    {request.approval_steps.map((step, index) => (
                      <div
                        key={step.id}
                        className={cn(
                          "rounded-lg border px-3 py-2 transition-colors",
                          getApprovalStepPanelClass(
                            step.status,
                            step.is_current,
                          ),
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">
                                Stage {step.stage_order}
                              </Badge>
                              {step.is_current && (
                                <Badge variant="secondary">Current</Badge>
                              )}
                              <Status
                                variant={getApprovalStepVariant(
                                  step.status,
                                  step.is_current,
                                )}
                              >
                                <StatusIndicator />
                                <StatusLabel>
                                  {formatApprovalStepStatus(step.status)}
                                </StatusLabel>
                              </Status>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <h3 className="text-sm font-semibold">
                                {step.approver_team}
                              </h3>
                              <span className="text-xs text-muted-foreground">
                                {step.approver_label ||
                                  `Stage ${step.stage_order} approval`}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {getApprovalStepDescription(
                                step.status,
                                step.is_current,
                              )}
                            </p>
                          </div>

                          <div className="text-right text-[11px] text-muted-foreground">
                            <p>
                              {step.acted_at
                                ? formatAbsoluteDate(step.acted_at)
                                : step.is_current
                                  ? "Awaiting action"
                                  : "Waiting for earlier stages"}
                            </p>
                            <p className="mt-1">
                              {step.acted_at
                                ? formatDistanceToNowStrict(
                                    new Date(step.acted_at),
                                    {
                                      addSuffix: true,
                                    },
                                  )
                                : step.is_current
                                  ? "Action needed now"
                                  : `Step ${index + 1} in queue`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/[0.06] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">Direct handling</h3>
                      <Status variant="success">
                        <StatusIndicator />
                        <StatusLabel>Completed</StatusLabel>
                      </Status>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      No explicit approval chain. This request was handled
                      directly.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-3">
            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Policy template</h2>
              </div>
              <Separator />
              <div className="space-y-2.5 px-3 py-3 text-sm">
                {request.policy_template_name ? (
                  <>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Matched template
                      </p>
                      <p className="mt-0.5 font-medium">
                        {request.policy_template_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Approval mode
                      </p>
                      <p className="mt-0.5">
                        {request.policy_template_approval_mode ?? "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Template owner
                      </p>
                      <p className="mt-0.5">
                        {request.policy_template_owner ?? "Unassigned"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Template resource
                      </p>
                      <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                        {request.policy_template_resource ?? "Any resource"}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This request did not match a policy template and is
                    following a manual review path.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border bg-card">
              <div className="px-3 py-2">
                <h2 className="text-sm font-semibold">Blast radius</h2>
              </div>
              <Separator />
              <div className="space-y-2.5 px-3 py-3 text-sm">
                {blastRadius ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md border px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Assets
                        </p>
                        <p className="mt-0.5 text-sm font-semibold">
                          {blastRadius.downstream_assets}
                        </p>
                      </div>
                      <div className="rounded-md border px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Dashboards
                        </p>
                        <p className="mt-0.5 text-sm font-semibold">
                          {blastRadius.dashboards}
                        </p>
                      </div>
                      <div className="rounded-md border px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Consumers
                        </p>
                        <p className="mt-0.5 text-sm font-semibold">
                          {blastRadius.consumers}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Sensitive domains
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {blastRadius.sensitive_domains.map((domain) => (
                          <Badge key={domain} variant="outline">
                            {domain}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Recommended guardrail
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {blastRadius.recommended_guardrail}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No blast-radius preview is available for this request.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
