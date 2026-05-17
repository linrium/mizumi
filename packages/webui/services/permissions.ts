import { apiFetch } from "@/lib/api-client"

export type RequestStatus =
  | "pending"
  | "ready"
  | "needs-info"
  | "approved"
  | "cancelled"
export type RequestScope = "catalog" | "schema" | "table"
export type RiskLevel = "low" | "medium" | "high"
export type ApprovalStepStatus =
  | "waiting"
  | "pending"
  | "needs-info"
  | "approved"
  | "cancelled"

export type PermissionApprovalStep = {
  id: string
  stage_order: number
  approver_team_id: string
  approver_team: string
  approver_label: string
  status: ApprovalStepStatus
  acted_at: string | null
  is_current: boolean
}

export type PermissionRequest = {
  id: string
  code: string
  submit_as: "personal" | "team"
  requester_id?: string
  requester: string
  requester_email?: string
  team_id?: string | null
  team: string | null
  resource: string
  scope: RequestScope
  privileges: string[]
  submitted_at: string
  expires_at: string
  expires_in_days: number
  status: RequestStatus
  reviewer: string
  rationale: string
  risk: RiskLevel
  policy_template_id: string | null
  policy_template_name: string | null
  policy_template_resource: string | null
  policy_template_approval_mode: "auto" | "review" | "escalate" | null
  policy_template_owner_id: string | null
  policy_template_owner: string | null
  approval_steps: PermissionApprovalStep[]
  current_approval_step_id: string | null
  queue_decision:
    | "auto-approved"
    | "reviewer-gate"
    | "security-escalation"
    | "manual-review"
}

export type PolicyTemplateApprovalStep = {
  id: string
  stage_order: number
  approver_team_id: string
  approver_team: string
  approver_label: string
}

export type PolicyTemplate = {
  id: string
  name: string
  scope: RequestScope
  resource: string | null
  team_ids: string[]
  teams: string[]
  privileges: string[]
  approval_mode: "auto" | "review" | "escalate"
  risk: RiskLevel
  usage_30d: number
  owner_id: string
  owner: string
  last_updated: string
  approval_steps: PolicyTemplateApprovalStep[]
}

export type BlastRadiusPreview = {
  request_id: string
  requester: string
  resource: string
  scope: RequestScope
  risk: RiskLevel
  downstream_assets: number
  dashboards: number
  consumers: number
  sensitive_domains: string[]
  recommended_guardrail: string
}

export type TimeBoundGrant = {
  id: string
  principal: string
  team: string
  resource: string
  privilege: string
  started_at: string
  expires_at: string
  reviewer: string
  renewal_status: "healthy" | "expiring" | "expired"
  reason: string
}

export type CreatePermissionRequestBody = {
  submit_as: "personal" | "team"
  team?: string
  resource: string
  scope: RequestScope
  privileges: string[]
  rationale: string
}

export async function listPermissionRequests(params?: {
  resource?: string
  status?: string
  search?: string
}): Promise<PermissionRequest[]> {
  const url = new URL("/api/permissions/requests", window.location.origin)
  if (params?.resource) url.searchParams.set("resource", params.resource)
  if (params?.status && params.status !== "all") {
    url.searchParams.set("status", params.status)
  }
  if (params?.search) url.searchParams.set("search", params.search)
  const res = await apiFetch(url.toString())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.requests
}

export async function createPermissionRequest(
  body: CreatePermissionRequestBody,
): Promise<PermissionRequest> {
  const res = await apiFetch("/api/permissions/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getPermissionRequest(
  id: string,
): Promise<PermissionRequest> {
  const res = await apiFetch(
    `/api/permissions/requests/${encodeURIComponent(id)}`,
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
  approvalStepId?: string,
): Promise<PermissionRequest> {
  const res = await apiFetch(
    `/api/permissions/requests/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        approval_step_id: approvalStepId ?? null,
      }),
    },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function cancelPermissionRequest(
  id: string,
): Promise<PermissionRequest> {
  return updateRequestStatus(id, "cancelled")
}

export async function bulkApprove(ids: string[]): Promise<PermissionRequest[]> {
  const res = await apiFetch("/api/permissions/requests/bulk-approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.updated
}

export async function listPolicyTemplates(): Promise<PolicyTemplate[]> {
  const res = await apiFetch("/api/permissions/policy-templates")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.templates
}

export async function getPolicyTemplate(id: string): Promise<PolicyTemplate> {
  const templates = await listPolicyTemplates()
  const template = templates.find((item) => item.id === id)
  if (!template) {
    throw new Error("HTTP 404")
  }
  return template
}

export async function listBlastRadius(): Promise<BlastRadiusPreview[]> {
  const res = await apiFetch("/api/permissions/blast-radius")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.previews
}

export async function listTimeBoundGrants(): Promise<TimeBoundGrant[]> {
  const res = await apiFetch("/api/permissions/grants")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.grants
}
