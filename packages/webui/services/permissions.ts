import { apiFetch } from "@/lib/api-client"

export type RequestStatus =
  | "pending"
  | "ready"
  | "needs-info"
  | "approved"
  | "cancelled"
export type RequestScope = "catalog" | "schema" | "table"
export type RiskLevel = "low" | "medium" | "high"
export type LlmRiskStatus =
  | "processing"
  | "failed"
  | "unknown"
  | "low"
  | "medium"
  | "high"
export type ApprovalStepStatus =
  | "waiting"
  | "pending"
  | "needs-info"
  | "approved"
  | "cancelled"

export interface PermissionApprovalStep {
  acted_at: string | null
  approver_label: string
  approver_team: string
  approver_team_id: string
  id: string
  is_current: boolean
  stage_order: number
  status: ApprovalStepStatus
}

export interface PermissionRequest {
  approval_steps: PermissionApprovalStep[]
  code: string
  current_approval_step_id: string | null
  expires_at: string
  expires_in_days: number
  id: string
  policy_template_approval_mode: "auto" | "review" | "escalate" | null
  policy_template_id: string | null
  policy_template_name: string | null
  policy_template_owner: string | null
  policy_template_owner_id: string | null
  policy_template_resource: string | null
  privileges: string[]
  queue_decision:
    | "auto-approved"
    | "time-bounded"
    | "security-escalation"
    | "manual-review"
  rationale: string
  renewal_of: string | null
  requester: string
  requester_email?: string
  requester_id?: string
  resource: string
  reviewer: string
  risk: RiskLevel
  scope: RequestScope
  status: RequestStatus
  submit_as: "personal" | "team"
  submitted_at: string
  team: string | null
  team_id?: string | null
}

export interface PolicyTemplateApprovalStep {
  approver_label: string
  approver_team: string
  approver_team_id: string
  id: string
  stage_order: number
}

export interface PolicyTemplate {
  approval_mode: "auto" | "review" | "escalate"
  approval_steps: PolicyTemplateApprovalStep[]
  id: string
  last_updated: string
  max_grant_duration_days: number
  name: string
  owner: string
  owner_id: string
  privileges: string[]
  resource: string | null
  risk: RiskLevel
  scope: RequestScope
  team_ids: string[]
  teams: string[]
  usage_30d: number
}

export interface AffectedComponent {
  display_name: string
  node_type: string
}

export interface BlastRadiusPreview {
  affected_nodes: AffectedComponent[]
  code: string
  consumers: number
  dashboards: number
  derived_risk: RiskLevel
  direct_downstream_nodes: number
  downstream_assets: number
  downstream_jobs: number
  downstream_schedules: number
  downstream_tables: number
  lineage_resolved: boolean
  lineage_root_display_name: string | null
  lineage_root_id: string | null
  lineage_root_type: string | null
  llm_explanation: string
  llm_recommendation: string
  llm_risk: LlmRiskStatus
  recommended_guardrail: string
  request_id: string
  requester: string
  resource: string
  risk: RiskLevel
  scope: RequestScope
  sensitive_domains: string[]
  total_downstream_nodes: number
}

export interface TimeBoundGrant {
  created_at: string
  expires_at: string
  id: string
  principal: string
  privilege: string
  reason: string
  renewal_status: "healthy" | "expiring" | "expired" | "revoked"
  resource: string
  reviewer_id: string
  scope: string
  source_request_id: string | null
  started_at: string
  team: string
  updated_at: string
}

export interface CreatePermissionRequestBody {
  privileges: string[]
  rationale: string
  renewal_of?: string
  requested_duration_days?: number
  resource: string
  scope: RequestScope
  submit_as: "personal" | "team"
  team?: string
}

export async function listPermissionRequests(params?: {
  resource?: string
  status?: string
  search?: string
  all?: boolean
}): Promise<PermissionRequest[]> {
  const url = new URL("/api/permissions/requests", window.location.origin)
  if (params?.resource) {
    url.searchParams.set("resource", params.resource)
  }
  if (params?.status && params.status !== "all") {
    url.searchParams.set("status", params.status)
  }
  if (params?.search) {
    url.searchParams.set("search", params.search)
  }
  if (params?.all) {
    url.searchParams.set("all", "true")
  }
  const res = await apiFetch(url.toString())
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.requests
}

export async function createPermissionRequest(
  body: CreatePermissionRequestBody
): Promise<PermissionRequest> {
  const res = await apiFetch("/api/permissions/requests", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getPermissionRequest(
  id: string
): Promise<PermissionRequest> {
  const res = await apiFetch(
    `/api/permissions/requests/${encodeURIComponent(id)}`
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
  approvalStepId?: string,
  grantDurationDays?: number
): Promise<PermissionRequest> {
  const res = await apiFetch(
    `/api/permissions/requests/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify({
        approval_step_id: approvalStepId ?? null,
        grant_duration_days: grantDurationDays ?? null,
        status,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export async function cancelPermissionRequest(
  id: string
): Promise<PermissionRequest> {
  return updateRequestStatus(id, "cancelled")
}

export async function bulkApprove(ids: string[]): Promise<PermissionRequest[]> {
  const res = await apiFetch("/api/permissions/requests/bulk-approve", {
    body: JSON.stringify({ ids }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.updated
}

export async function listPolicyTemplates(): Promise<PolicyTemplate[]> {
  const res = await apiFetch("/api/permissions/policy-templates")
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.previews
}

export async function getBlastRadius(
  requestId: string
): Promise<BlastRadiusPreview> {
  const res = await apiFetch(
    `/api/permissions/requests/${encodeURIComponent(requestId)}/blast-radius`
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export async function listTimeBoundGrants(params?: {
  status?: string
  resource?: string
  principal?: string
}): Promise<TimeBoundGrant[]> {
  const url = new URL("/api/permissions/grants", window.location.origin)
  if (params?.status) {
    url.searchParams.set("status", params.status)
  }
  if (params?.resource) {
    url.searchParams.set("resource", params.resource)
  }
  if (params?.principal) {
    url.searchParams.set("principal", params.principal)
  }
  const res = await apiFetch(url.toString())
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.grants
}

export async function getTimeBoundGrant(id: string): Promise<TimeBoundGrant> {
  const res = await apiFetch(
    `/api/permissions/grants/${encodeURIComponent(id)}`
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export async function revokeGrant(
  id: string,
  reason?: string
): Promise<TimeBoundGrant> {
  const res = await apiFetch(
    `/api/permissions/grants/${encodeURIComponent(id)}/revoke`,
    {
      body: JSON.stringify({ reason: reason ?? null }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function adminRenewGrant(
  id: string,
  expiresAt: string
): Promise<TimeBoundGrant> {
  const res = await apiFetch(
    `/api/permissions/grants/${encodeURIComponent(id)}/renew`,
    {
      body: JSON.stringify({ expires_at: expiresAt }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}
