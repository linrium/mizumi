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
      (m) => m.LineageGraph
    ),
  { ssr: false }
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
  if (status === "approved") {
    return "success"
  }
  if (status === "needs-info") {
    return "warning"
  }
  if (status === "cancelled") {
    return "error"
  }
  if (isCurrent || status === "pending") {
    return "info"
  }
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
      <Badge className="animate-pulse text-muted-foreground" variant="outline">
        LLM analysing…
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge
        className="border-destructive/40 text-destructive"
        variant="outline"
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
  if (type === "table" || type === "topic") {
    return "Datasets"
  }
  if (type === "dagster_asset") {
    return "Assets"
  }
  if (
    ["spark_job", "streaming_job", "daft_job", "dagster_job"].includes(type)
  ) {
    return "Jobs"
  }
  if (type === "schedule") {
    return "Schedules"
  }
  if (type === "dashboard") {
    return "Dashboards"
  }
  if (type === "consumer") {
    return "Consumers"
  }
  return "Other"
}

export default function PermissionRequestDetailPage() {
  const params = useParams<{ id: string }>()
  const requestId = typeof params.id === "string" ? params.id : ""
  const [request, setRequest] = useState<PermissionRequest | null>(null)
  const [blastRadius, setBlastRadius] = useState<BlastRadiusPreview | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioningKey, setActioningKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"guardrail" | "components">(
    "guardrail"
  )

  // Approval confirmation dialog for time-bounded requests
  const [approvalDialog, setApprovalDialog] = useState<{
    stepId: string
    durationDays: string
  } | null>(null)

  const groupedComponents = useMemo(() => {
    if (!blastRadius) {
      return {} as Record<string, string[]>
    }
    const map: Record<string, string[]> = {}
    for (const node of blastRadius.affected_nodes) {
      const cat = nodeTypeToCategory(node.node_type)
      if (!map[cat]) {
        map[cat] = []
      }
      map[cat].push(node.display_name)
    }
    return map
  }, [blastRadius])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!requestId) {
        return
      }
      setLoading(true)
      setError(null)

      try {
        const [requestData, blastRadiusData] = await Promise.all([
          getPermissionRequest(requestId),
          getBlastRadius(requestId),
        ])

        if (cancelled) {
          return
        }

        setRequest(requestData)
        setBlastRadius(blastRadiusData)
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load permission request"
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
    [request]
  )

  async function handleStatusUpdate(
    status: RequestStatus,
    approvalStepId?: string,
    grantDurationDays?: number
  ) {
    if (!request) {
      return
    }

    const key = `${status}:${approvalStepId ?? "request"}`
    setActioningKey(key)
    setError(null)

    try {
      const updated = await updateRequestStatus(
        request.id,
        status,
        approvalStepId,
        grantDurationDays
      )
      setRequest(updated)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update permission request"
      )
    } finally {
      setActioningKey(null)
    }
  }

  function openApprovalDialog(stepId: string) {
    setApprovalDialog({
      durationDays: String(Math.max(request?.expires_in_days ?? 30, 1)),
      stepId,
    })
  }

  async function handleApprovalDialogConfirm() {
    if (!(approvalDialog && request)) {
      return
    }
    const days = Number.parseInt(approvalDialog.durationDays, 10)
    if (!days || days < 1) {
      setError("Grant duration must be at least 1 day")
      return
    }
    setApprovalDialog(null)
    await handleStatusUpdate("approved", approvalDialog.stepId, days)
  }

  function handleApprove(stepId: string) {
    if (!request) {
      return
    }
    openApprovalDialog(stepId)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading request…
      </div>
    )
  }

  if (error || !request) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div>
          <p className="font-semibold text-sm">Request unavailable</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {error ?? "The permission request could not be found."}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/permissions">Back to queue</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Page header */}
        <div className="shrink-0 border-b px-6 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link
                className="text-muted-foreground text-xs hover:underline"
                href="/permissions"
              >
                Back to request queue
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <h1 className="font-semibold text-sm">{request.code}</h1>
                <Status variant={getStatusVariant(request.status)}>
                  <StatusIndicator />
                  <StatusLabel>{formatStatusLabel(request.status)}</StatusLabel>
                </Status>
                <Badge variant="outline">
                  {formatScopeLabel(request.scope)}
                </Badge>
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {request.requester} submitted this as {formatSubmitter(request)}{" "}
                for <span className="font-mono">{request.resource}</span>.
              </p>
              {error && (
                <p className="mt-1 text-destructive text-xs">{error}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {currentSteps.length <= 1 && currentSteps[0] ? (
                <Button
                  disabled={actioningKey != null}
                  onClick={() => handleApprove(currentSteps[0]?.id ?? "")}
                  size="sm"
                >
                  {actioningKey === `approved:${currentSteps[0]?.id}`
                    ? "Approving…"
                    : "Approve current step"}
                </Button>
              ) : (
                currentSteps.map((step) => (
                  <Button
                    disabled={actioningKey != null}
                    key={step.id}
                    onClick={() => handleApprove(step.id)}
                    size="sm"
                  >
                    {actioningKey === `approved:${step.id}`
                      ? "Approving…"
                      : `Approve ${step.approver_team}`}
                  </Button>
                ))
              )}
              {currentSteps[0] && (
                <Button
                  disabled={actioningKey != null}
                  onClick={() =>
                    handleStatusUpdate("needs-info", currentSteps[0]?.id)
                  }
                  size="sm"
                  variant="outline"
                >
                  {actioningKey === `needs-info:${currentSteps[0]?.id}`
                    ? "Updating…"
                    : "Request more context"}
                </Button>
              )}
              {CANCELLABLE.includes(request.status) && (
                <Button
                  disabled={actioningKey != null}
                  onClick={() => handleStatusUpdate("cancelled")}
                  size="sm"
                  variant="outline"
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
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-[360px] shrink-0 divide-y overflow-y-auto border-r">
            <section>
              <div className="px-4 py-3">
                <h2 className="font-semibold text-sm">Request summary</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Request details, access scope, and routing context.
                </p>
              </div>
              <Separator />
              <div className="grid gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-2">
                <div className="space-y-2.5">
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Requester
                    </p>
                    <p className="mt-0.5 font-medium text-sm">
                      {request.requester}
                    </p>
                    {request.requester_email && (
                      <p className="text-muted-foreground text-xs">
                        {request.requester_email}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Submission target
                    </p>
                    <p className="mt-0.5 text-sm">{formatSubmitter(request)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Queue decision
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatQueueDecision(request.queue_decision)}
                    </p>
                  </div>
                  {request.renewal_of && (
                    <div>
                      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        Renewal of grant
                      </p>
                      <Link
                        className="mt-0.5 block truncate font-mono text-muted-foreground text-xs hover:underline"
                        href={`/permissions/grants/${request.renewal_of}`}
                      >
                        {request.renewal_of}
                      </Link>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Submitted
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatAbsoluteDate(request.submitted_at)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDistanceToNowStrict(
                        new Date(request.submitted_at),
                        {
                          addSuffix: true,
                        }
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Expires
                    </p>
                    <p className="mt-0.5 text-sm">
                      {formatAbsoluteDate(request.expires_at)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {request.expires_in_days <= 0
                        ? "Expired"
                        : `${request.expires_in_days} day${request.expires_in_days === 1 ? "" : "s"} remaining`}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Current reviewer
                    </p>
                    <p className="mt-0.5 text-sm">{request.reviewer}</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="px-4 py-3">
                <h2 className="font-semibold text-sm">Access requested</h2>
              </div>
              <Separator />
              <div className="space-y-3 px-4 py-4">
                <div className="grid gap-3">
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                      Resource
                    </p>
                    <p className="mt-0.5 break-all font-mono text-sm">
                      {request.resource}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
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
                  <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                    Rationale
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-sm">
                    {request.rationale || "No rationale provided."}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <div className="px-4 py-3">
                <h2 className="font-semibold text-sm">Approval flow</h2>
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
                        className={cn(
                          "rounded-lg border px-3 py-2 transition-colors",
                          getApprovalStepPanelClass(
                            step.status,
                            step.is_current
                          )
                        )}
                        key={step.id}
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
                                  step.is_current
                                )}
                              >
                                <StatusIndicator />
                                <StatusLabel>
                                  {formatApprovalStepStatus(step.status)}
                                </StatusLabel>
                              </Status>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <h3 className="font-semibold text-sm">
                                {step.approver_team}
                              </h3>
                              <span className="text-muted-foreground text-xs">
                                {step.approver_label ||
                                  `Stage ${step.stage_order} approval`}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {getApprovalStepDescription(
                                step.status,
                                step.is_current
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
                                    }
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
                      <h3 className="font-semibold text-sm">Direct handling</h3>
                      <Status variant="success">
                        <StatusIndicator />
                        <StatusLabel>Completed</StatusLabel>
                      </Status>
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
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
                <h2 className="font-semibold text-sm">Policy template</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Template match and routing configuration for this request.
                </p>
              </div>
              <Separator />
              <div className="px-4 py-4">
                {request.policy_template_name ? (
                  <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
                    <div>
                      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        Matched template
                      </p>
                      <p className="mt-0.5 font-medium text-sm">
                        {request.policy_template_name}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        Approval mode
                      </p>
                      <p className="mt-0.5 text-sm capitalize">
                        {request.policy_template_approval_mode ?? "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        Template owner
                      </p>
                      <p className="mt-0.5 text-sm">
                        {request.policy_template_owner ?? "Unassigned"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        Template resource
                      </p>
                      <p className="mt-0.5 break-all font-mono text-muted-foreground text-xs">
                        {request.policy_template_resource ?? "Any resource"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    This request did not match a policy template and is
                    following a manual review path.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Right panel: Impact & lineage */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-6 py-3">
              <h2 className="font-semibold text-sm">Impact & lineage</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Downstream blast radius and data lineage for the requested
                resource.
              </p>
            </div>
            <Separator />

            {/* Lineage graph + right sidebar */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Lineage graph */}
              <div className="relative min-w-0 flex-1">
                <LineageGraph
                  currentPath={
                    request.scope === "table"
                      ? request.resource.split(".")
                      : undefined
                  }
                  enableNeighborhoodSelection
                  initialDepth={1}
                  neighborhoodOnly
                  selectRoot
                  selectRootHint={
                    request.scope === "table"
                      ? undefined
                      : {
                          displayName:
                            request.resource.split(".").at(-1) ??
                            request.resource,
                          nodeType: request.scope,
                        }
                  }
                />
              </div>

              {/* Right sidebar: Guardrail / Components */}
              {blastRadius && (
                <div className="flex w-64 shrink-0 flex-col overflow-hidden border-l">
                  {/* Risk + root resource */}
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-3">
                    <LlmRiskBadge status={blastRadius.llm_risk} />
                    {blastRadius.lineage_root_display_name && (
                      <span className="break-all font-mono text-[11px] text-muted-foreground">
                        {blastRadius.lineage_root_display_name}
                      </span>
                    )}
                  </div>

                  <div className="flex border-b px-4">
                    {(["guardrail", "components"] as const).map((tab) => (
                      <button
                        className={cn(
                          "mr-4 -mb-px border-b-2 py-2.5 font-medium text-xs capitalize transition-colors",
                          activeTab === tab
                            ? "border-foreground text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                        key={tab}
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
                          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background">
                                <HugeiconsIcon
                                  className="h-3.5 w-3.5 text-foreground"
                                  icon={Shield01Icon}
                                />
                              </div>
                              <p className="font-semibold text-xs">
                                Recommended
                              </p>
                            </div>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              {blastRadius.recommended_guardrail}
                            </p>
                          </div>
                        ) : null}
                        {blastRadius.llm_recommendation ? (
                          <div className="space-y-2">
                            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                              LLM recommendation
                            </p>
                            <p className="text-foreground/90 text-sm leading-relaxed">
                              {blastRadius.llm_recommendation}
                            </p>
                            {blastRadius.llm_explanation && (
                              <p className="text-muted-foreground text-sm italic leading-relaxed">
                                {blastRadius.llm_explanation}
                              </p>
                            )}
                          </div>
                        ) : null}
                        {!(
                          blastRadius.recommended_guardrail ||
                          blastRadius.llm_recommendation
                        ) && (
                          <div className="flex flex-col items-center gap-2 py-6 text-center">
                            <HugeiconsIcon
                              className="h-8 w-8 text-muted-foreground/30"
                              icon={Shield01Icon}
                            />
                            <p className="text-muted-foreground text-xs">
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
                              <p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                                {category}
                              </p>
                              <ul className="space-y-0.5">
                                {names.map((name) => (
                                  <li
                                    className="break-all font-mono text-xs"
                                    key={name}
                                  >
                                    {name}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        )}
                        {blastRadius.affected_nodes.length === 0 && (
                          <p className="text-muted-foreground text-xs">
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
        onOpenChange={(open) => {
          if (!open && actioningKey == null) {
            setApprovalDialog(null)
          }
        }}
        open={approvalDialog !== null}
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
            <div className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Requester</span>
                <span className="font-medium">{request.requester}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Resource</span>
                <span className="break-all text-right font-mono">
                  {request.resource}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Scope</span>
                <Badge className="text-[10px]" variant="outline">
                  {request.scope}
                </Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Privileges</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {request.privileges.map((p) => (
                    <Badge className="text-[10px]" key={p} variant="outline">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              {request.policy_template_name && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Policy</span>
                  <span className="text-right">
                    {request.policy_template_name}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="grant-duration-days">
              Grant duration (days)
            </Label>
            <Input
              className="h-8 text-sm"
              id="grant-duration-days"
              max={request?.expires_in_days ?? 365}
              min={1}
              onChange={(e) =>
                setApprovalDialog((prev) =>
                  prev ? { ...prev, durationDays: e.target.value } : prev
                )
              }
              placeholder="e.g. 30"
              type="number"
              value={approvalDialog?.durationDays ?? ""}
            />
            {approvalDialog && Number(approvalDialog.durationDays) >= 1 && (
              <p className="text-muted-foreground text-xs">
                Access expires on{" "}
                {new Date(
                  Date.now() + Number(approvalDialog.durationDays) * 86_400_000
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
              disabled={actioningKey != null}
              onClick={() => setApprovalDialog(null)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                actioningKey != null ||
                !approvalDialog ||
                !(Number(approvalDialog.durationDays) >= 1)
              }
              onClick={handleApprovalDialogConfirm}
            >
              {actioningKey == null ? "Confirm & grant access" : "Approving…"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
