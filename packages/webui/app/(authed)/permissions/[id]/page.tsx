"use client"

import { Shield01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { format, formatDistanceToNowStrict } from "date-fns"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { cn } from "@/lib/utils"
import {
  type BlastRadiusPreview,
  getBlastRadius,
  getPermissionRequest,
  type LlmRiskStatus,
  type PermissionRequest,
  type RequestStatus,
  type RiskLevel,
  updateRequestStatus,
} from "@/services/permissions"

const LineageGraph = dynamic(
  () =>
    import("@/app/(authed)/pipelines/assets/[...path]/LineageGraph").then(
      (m) => m.LineageGraph,
    ),
  { ssr: false },
)

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

function formatRiskLabel(risk: RiskLevel) {
  return `${risk[0]?.toUpperCase() + risk.slice(1)} risk`
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
    case "time-bounded":
      return "Matched template, time-bound access pending approval"
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

function LlmRiskBadge({ status }: { status: LlmRiskStatus }) {
  if (status === "processing") {
    return (
      <Badge variant="outline" className="animate-pulse text-muted-foreground">
        LLM analysing…
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="text-destructive border-destructive/40"
      >
        LLM failed
      </Badge>
    )
  }
  if (status === "unknown") {
    return null
  }
  const variant =
    status === "high"
      ? "destructive"
      : status === "medium"
        ? "secondary"
        : "outline"
  return (
    <Badge variant={variant}>
      LLM {status[0]?.toUpperCase() + status.slice(1)} risk
    </Badge>
  )
}

function nodeTypeToCategory(type: string): string {
  if (type === "table" || type === "topic") return "Datasets"
  if (type === "dagster_asset") return "Assets"
  if (["spark_job", "streaming_job", "daft_job", "dagster_job"].includes(type))
    return "Jobs"
  if (type === "schedule") return "Schedules"
  if (type === "dashboard") return "Dashboards"
  if (type === "consumer") return "Consumers"
  return "Other"
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
  const [activeTab, setActiveTab] = useState<"guardrail" | "components">(
    "guardrail",
  )

  // Approval confirmation dialog for time-bounded requests
  const [approvalDialog, setApprovalDialog] = useState<{
    stepId: string
    durationDays: string
  } | null>(null)

  const groupedComponents = useMemo(() => {
    if (!blastRadius) return {} as Record<string, string[]>
    const map: Record<string, string[]> = {}
    for (const node of blastRadius.affected_nodes) {
      const cat = nodeTypeToCategory(node.node_type)
      if (!map[cat]) map[cat] = []
      map[cat].push(node.display_name)
    }
    return map
  }, [blastRadius])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!requestId) return
      setLoading(true)
      setError(null)

      try {
        const [requestData, blastRadiusData] = await Promise.all([
          getPermissionRequest(requestId),
          getBlastRadius(requestId),
        ])

        if (cancelled) return

        setRequest(requestData)
        setBlastRadius(blastRadiusData)
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
    grantDurationDays?: number,
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
        grantDurationDays,
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

  function openApprovalDialog(stepId: string) {
    setApprovalDialog({
      stepId,
      durationDays: String(Math.max(request?.expires_in_days ?? 30, 1)),
    })
  }

  async function handleApprovalDialogConfirm() {
    if (!approvalDialog || !request) return
    const days = parseInt(approvalDialog.durationDays, 10)
    if (!days || days < 1) {
      setError("Grant duration must be at least 1 day")
      return
    }
    setApprovalDialog(null)
    await handleStatusUpdate("approved", approvalDialog.stepId, days)
  }

  function handleApprove(stepId: string) {
    if (!request) return
    if (request.queue_decision === "time-bounded") {
      openApprovalDialog(stepId)
    } else {
      handleStatusUpdate("approved", stepId)
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
    <>
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="border-b px-6 py-3 shrink-0">
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
                onClick={() => handleApprove(currentSteps[0]?.id ?? "")}
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
                  onClick={() => handleApprove(step.id)}
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

      {/* Body: sidebar + main content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[360px] shrink-0 border-r overflow-y-auto divide-y">
          <section>
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">Request summary</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Request details, access scope, and routing context.
              </p>
            </div>
            <Separator />
            <div className="grid gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-2">
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
                {request.renewal_of && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Renewal of grant
                    </p>
                    <Link
                      href={`/permissions/grants/${request.renewal_of}`}
                      className="mt-0.5 block font-mono text-xs text-muted-foreground hover:underline truncate"
                    >
                      {request.renewal_of}
                    </Link>
                  </div>
                )}
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
                    {formatDistanceToNowStrict(new Date(request.submitted_at), {
                      addSuffix: true,
                    })}
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

          <section>
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">Access requested</h2>
            </div>
            <Separator />
            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3">
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

          <section>
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">Approval flow</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Stage-by-stage approver routing for this request.
              </p>
            </div>
            <Separator />
            <div className="px-4 py-4">
              {request.approval_steps.length > 0 ? (
                <div className="space-y-1.5">
                  {request.approval_steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={cn(
                        "rounded-lg border px-3 py-2 transition-colors",
                        getApprovalStepPanelClass(step.status, step.is_current),
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

          {/* Policy template */}
          <section>
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">Policy template</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Template match and routing configuration for this request.
              </p>
            </div>
            <Separator />
            <div className="px-4 py-4">
              {request.policy_template_name ? (
                <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Matched template
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {request.policy_template_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Approval mode
                    </p>
                    <p className="mt-0.5 text-sm capitalize">
                      {request.policy_template_approval_mode ?? "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Template owner
                    </p>
                    <p className="mt-0.5 text-sm">
                      {request.policy_template_owner ?? "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Template resource
                    </p>
                    <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                      {request.policy_template_resource ?? "Any resource"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This request did not match a policy template and is following
                  a manual review path.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right panel: Impact & lineage */}
        <section className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-3 shrink-0">
            <h2 className="text-sm font-semibold">Impact & lineage</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Downstream blast radius and data lineage for the requested
              resource.
            </p>
          </div>
          <Separator />

          {/* Lineage graph + right sidebar */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Lineage graph */}
            <div className="flex-1 min-w-0 relative">
              <LineageGraph
                currentPath={request.resource.split(".")}
                neighborhoodOnly
              />
            </div>

            {/* Right sidebar: Guardrail / Components */}
            {blastRadius && (
              <div className="w-64 shrink-0 border-l flex flex-col overflow-hidden">
                {/* Risk + root resource */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-1.5 shrink-0 border-b">
                  <LlmRiskBadge status={blastRadius.llm_risk} />
                  {blastRadius.lineage_root_display_name && (
                    <span className="text-[11px] text-muted-foreground font-mono break-all">
                      {blastRadius.lineage_root_display_name}
                    </span>
                  )}
                </div>

                <div className="flex border-b px-4">
                  {(["guardrail", "components"] as const).map((tab) => (
                    <button
                      key={tab}
                      className={cn(
                        "py-2.5 text-xs font-medium border-b-2 -mb-px mr-4 capitalize transition-colors",
                        activeTab === tab
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {activeTab === "guardrail" && (
                    <div className="space-y-4">
                      {blastRadius.recommended_guardrail ? (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background border">
                              <HugeiconsIcon
                                icon={Shield01Icon}
                                className="h-3.5 w-3.5 text-foreground"
                              />
                            </div>
                            <p className="text-xs font-semibold">Recommended</p>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {blastRadius.recommended_guardrail}
                          </p>
                        </div>
                      ) : null}
                      {blastRadius.llm_recommendation ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            LLM recommendation
                          </p>
                          <p className="text-sm text-foreground/90 leading-relaxed">
                            {blastRadius.llm_recommendation}
                          </p>
                          {blastRadius.llm_explanation && (
                            <p className="text-sm text-muted-foreground italic leading-relaxed">
                              {blastRadius.llm_explanation}
                            </p>
                          )}
                        </div>
                      ) : null}
                      {!blastRadius.recommended_guardrail &&
                        !blastRadius.llm_recommendation && (
                          <div className="flex flex-col items-center gap-2 py-6 text-center">
                            <HugeiconsIcon
                              icon={Shield01Icon}
                              className="h-8 w-8 text-muted-foreground/30"
                            />
                            <p className="text-xs text-muted-foreground">
                              No guardrail recommendations.
                            </p>
                          </div>
                        )}
                    </div>
                  )}

                  {activeTab === "components" && (
                    <div className="space-y-4">
                      {Object.entries(groupedComponents).map(
                        ([category, names]) => (
                          <div key={category}>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {category}
                            </p>
                            <ul className="space-y-0.5">
                              {names.map((name) => (
                                <li
                                  key={name}
                                  className="break-all font-mono text-xs"
                                >
                                  {name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ),
                      )}
                      {blastRadius.affected_nodes.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No affected components.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>

    {/* Time-bound approval dialog */}
    <Dialog
      open={approvalDialog !== null}
      onOpenChange={(open) => {
        if (!open && actioningKey == null) setApprovalDialog(null)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve time-bound access</DialogTitle>
          <DialogDescription>
            Confirm the grant duration before issuing access. The requester
            asked for{" "}
            <strong>
              {request?.expires_in_days ?? 0} day
              {request?.expires_in_days === 1 ? "" : "s"}
            </strong>
            . You can reduce it but not exceed the requested duration.
          </DialogDescription>
        </DialogHeader>

        {/* Request summary */}
        {request && (
          <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs space-y-1.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Requester</span>
              <span className="font-medium">{request.requester}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Resource</span>
              <span className="font-mono text-right break-all">
                {request.resource}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Scope</span>
              <Badge variant="outline" className="text-[10px]">
                {request.scope}
              </Badge>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Privileges</span>
              <div className="flex flex-wrap justify-end gap-1">
                {request.privileges.map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
            {request.policy_template_name && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Policy</span>
                <span className="text-right">{request.policy_template_name}</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="grant-duration-days" className="text-xs">
            Grant duration (days)
          </Label>
          <Input
            id="grant-duration-days"
            type="number"
            min={1}
            max={request?.expires_in_days ?? 365}
            value={approvalDialog?.durationDays ?? ""}
            onChange={(e) =>
              setApprovalDialog((prev) =>
                prev ? { ...prev, durationDays: e.target.value } : prev,
              )
            }
            className="h-8 text-sm"
            placeholder="e.g. 30"
          />
          {approvalDialog && Number(approvalDialog.durationDays) >= 1 && (
            <p className="text-xs text-muted-foreground">
              Access expires on{" "}
              {new Date(
                Date.now() +
                  Number(approvalDialog.durationDays) * 86_400_000,
              ).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setApprovalDialog(null)}
            disabled={actioningKey != null}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprovalDialogConfirm}
            disabled={actioningKey != null}
          >
            {actioningKey != null ? "Approving…" : "Confirm & grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
