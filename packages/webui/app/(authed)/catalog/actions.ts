"use server"

import { getServerSession } from "@/lib/auth"
import {
  getCatalogs,
  getPermissions,
  getSchemas,
  getTable,
  getTables,
  patchPermissions,
} from "@/services/catalog"
import type {
  RequestScope,
  RequestStatus,
  RiskLevel,
} from "@/services/permissions"

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000"
const DEFAULT_REVIEWER_ID = "10000000-0000-0000-0000-000000000011"
const DEFAULT_REVIEWER_NAME = "Data Steward"
const DEFAULT_REQUEST_TEAM_ID = "10000000-0000-0000-0000-000000000006"

const TEAM_IDS_BY_NAME: Record<string, string> = {
  "Fraud Ops": "10000000-0000-0000-0000-000000000001",
  "Growth Analytics": "10000000-0000-0000-0000-000000000002",
  "Finance BI": "10000000-0000-0000-0000-000000000003",
  "ML Platform": "10000000-0000-0000-0000-000000000004",
  Operations: "10000000-0000-0000-0000-000000000005",
  "Data Platform": "10000000-0000-0000-0000-000000000006",
  "Executive Analytics": "10000000-0000-0000-0000-000000000007",
  "Support Intelligence": "10000000-0000-0000-0000-000000000008",
  Governance: "10000000-0000-0000-0000-000000000009",
  Security: "10000000-0000-0000-0000-000000000010",
  "Data Steward": "10000000-0000-0000-0000-000000000011",
}

function resolveRequesterTeamId(groups?: string[]) {
  for (const group of groups ?? []) {
    if (TEAM_IDS_BY_NAME[group]) {
      return TEAM_IDS_BY_NAME[group]
    }
  }

  return DEFAULT_REQUEST_TEAM_ID
}

export async function getCatalogsAction() {
  return getCatalogs()
}

export async function getSchemasAction(catalog: string) {
  return getSchemas(catalog)
}

export async function getTablesAction(catalog: string, schema: string) {
  return getTables(catalog, schema)
}

export async function getTableAction(
  catalog: string,
  schema: string,
  table: string,
) {
  return getTable(catalog, schema, table)
}

export async function getPermissionsAction(
  resourceType: "catalog" | "schema" | "table",
  catalog: string,
  schema?: string,
  table?: string,
) {
  return getPermissions(resourceType, catalog, schema, table)
}

export async function getMyPrivilegesAction(
  resourceType: "catalog" | "schema" | "table",
  catalog: string,
  schema?: string,
  table?: string,
): Promise<string[]> {
  const session = await getServerSession()
  if (!session?.email) return []
  try {
    const data = await getPermissions(resourceType, catalog, schema, table)
    const assignment = (data.privilege_assignments ?? []).find(
      (a) => a.principal.toLowerCase() === session.email?.toLowerCase(),
    )
    return assignment?.privileges ?? []
  } catch {
    return []
  }
}

export async function patchPermissionsAction(input: {
  resourceType: "catalog" | "schema" | "table"
  catalog: string
  schema?: string
  table?: string
  principal: string
  add: string[]
  remove: string[]
}) {
  return patchPermissions(input)
}

// ── Permission request store ──────────────────────────────────────────────────

export type StoredPermissionRequest = {
  id: string
  code: string
  requester: string
  team: string
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
  queue_decision:
    | "auto-approved"
    | "reviewer-gate"
    | "security-escalation"
    | "manual-review"
}

const permissionStore: StoredPermissionRequest[] = [
  {
    id: "PR-1042",
    code: "PR-1042",
    requester: "Annie Case",
    team: "Fraud Ops",
    resource: "risk.gold_chargebacks",
    scope: "table",
    privileges: ["SELECT", "MODIFY"],
    submitted_at: "2026-05-16T01:12:00.000Z",
    expires_at: "2026-05-17T01:12:00.000Z",
    expires_in_days: 1,
    status: "pending",
    reviewer: "Data Platform",
    rationale: "Investigating a spike in dispute reversals for the Japan lane.",
    risk: "high",
    policy_template_id: "40000000-0000-0000-0000-000000000002",
    policy_template_name: "Operational writeback",
    policy_template_resource: "risk.gold_chargebacks",
    policy_template_approval_mode: "review",
    policy_template_owner_id: "10000000-0000-0000-0000-000000000011",
    policy_template_owner: "Data Steward",
    queue_decision: "reviewer-gate",
  },
  {
    id: "PR-1041",
    code: "PR-1041",
    requester: "Mai Nguyen",
    team: "Growth Analytics",
    resource: "marketing",
    scope: "catalog",
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    submitted_at: "2026-05-15T06:30:00.000Z",
    expires_at: "2026-05-20T06:30:00.000Z",
    expires_in_days: 5,
    status: "ready",
    reviewer: "Governance",
    rationale: "Standing up a campaign-attribution sandbox for a new partner.",
    risk: "medium",
    policy_template_id: "40000000-0000-0000-0000-000000000003",
    policy_template_name: "Catalog bootstrap",
    policy_template_resource: "marketing",
    policy_template_approval_mode: "review",
    policy_template_owner_id: "10000000-0000-0000-0000-000000000006",
    policy_template_owner: "Data Platform",
    queue_decision: "reviewer-gate",
  },
  {
    id: "PR-1039",
    code: "PR-1039",
    requester: "Kenji Mori",
    team: "Finance BI",
    resource: "finance.ap_closure",
    scope: "schema",
    privileges: ["USE_SCHEMA", "SELECT"],
    submitted_at: "2026-05-14T10:00:00.000Z",
    expires_at: "2026-05-28T10:00:00.000Z",
    expires_in_days: 14,
    status: "approved",
    reviewer: "Governance",
    rationale: "Month-end close support for vendor accrual reconciliation.",
    risk: "low",
    policy_template_id: "40000000-0000-0000-0000-000000000001",
    policy_template_name: "Analytics read sandbox",
    policy_template_resource: null,
    policy_template_approval_mode: "auto",
    policy_template_owner_id: "10000000-0000-0000-0000-000000000009",
    policy_template_owner: "Governance",
    queue_decision: "auto-approved",
  },
]

type PermissionRequestApiResponse = {
  id: string
  code: string
  requester_id: string
  requester: string
  requester_email: string
  team_id: string
  team: string
  resource: string
  scope: RequestScope
  privileges: string[]
  submitted_at: string
  expires_at: string
  expires_in_days: number
  status: RequestStatus
  reviewer_id: string
  reviewer: string
  rationale: string
  risk: RiskLevel
  policy_template_id: string | null
  policy_template_name: string | null
  policy_template_resource: string | null
  policy_template_approval_mode: "auto" | "review" | "escalate" | null
  policy_template_owner_id: string | null
  policy_template_owner: string | null
  queue_decision:
    | "auto-approved"
    | "reviewer-gate"
    | "security-escalation"
    | "manual-review"
}

function mapPermissionRequest(
  request: PermissionRequestApiResponse,
): StoredPermissionRequest {
  return {
    id: request.id,
    code: request.code,
    requester: request.requester,
    team: request.team,
    resource: request.resource,
    scope: request.scope,
    privileges: request.privileges,
    submitted_at: request.submitted_at,
    expires_at: request.expires_at,
    expires_in_days: request.expires_in_days,
    status: request.status,
    reviewer:
      request.reviewer ||
      (request.reviewer_id === DEFAULT_REVIEWER_ID
        ? DEFAULT_REVIEWER_NAME
        : request.reviewer_id),
    rationale: request.rationale,
    risk: request.risk,
    policy_template_id: request.policy_template_id,
    policy_template_name: request.policy_template_name,
    policy_template_resource: request.policy_template_resource,
    policy_template_approval_mode: request.policy_template_approval_mode,
    policy_template_owner_id: request.policy_template_owner_id,
    policy_template_owner: request.policy_template_owner,
    queue_decision: request.queue_decision,
  }
}

export async function listPermissionRequestsAction(
  resource: string,
): Promise<StoredPermissionRequest[]> {
  const session = await getServerSession()
  if (!session?.idToken) {
    return permissionStore.filter((r) => r.resource === resource)
  }

  try {
    const url = new URL("/api/permissions/requests", API_BASE_URL)
    url.searchParams.set("resource", resource)

    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.idToken}`,
      },
    })

    if (!res.ok) {
      return permissionStore.filter((r) => r.resource === resource)
    }

    const body = (await res.json()) as {
      requests: PermissionRequestApiResponse[]
    }
    return body.requests.map(mapPermissionRequest)
  } catch {
    return permissionStore.filter((r) => r.resource === resource)
  }
}

export async function submitPermissionRequestAction(body: {
  resource: string
  scope: RequestScope
  privileges: string[]
  rationale: string
}): Promise<{ data?: StoredPermissionRequest; error?: string }> {
  if (!body.privileges.length) {
    return { error: "Select at least one privilege." }
  }
  const session = await getServerSession()
  if (!session?.idToken) {
    return { error: "You must be signed in to submit a request." }
  }
  if (!session.sub) {
    return { error: "Your session is missing a user identifier." }
  }

  try {
    const requesterTeamId = resolveRequesterTeamId(session.groups)
    const res = await fetch(`${API_BASE_URL}/api/permissions/requests`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requester_id: session.sub,
        team: requesterTeamId,
        resource: body.resource,
        scope: body.scope,
        privileges: body.privileges,
        rationale: body.rationale,
        reviewer_id: DEFAULT_REVIEWER_ID,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        error:
          (err as { error?: string }).error ??
          `Failed to submit request (${res.status}).`,
      }
    }

    const request = (await res.json()) as PermissionRequestApiResponse

    return {
      data: mapPermissionRequest({
        ...request,
        requester:
          request.requester ||
          session.name ||
          session.email ||
          session.preferredUsername ||
          "You",
      }),
    }
  } catch {
    return { error: "Failed to reach the permissions service." }
  }
}

export async function cancelPermissionRequestAction(
  id: string,
): Promise<{ data?: StoredPermissionRequest; error?: string }> {
  const session = await getServerSession()
  if (session?.idToken) {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/permissions/requests/${id}`,
        {
          method: "PATCH",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "cancelled" }),
        },
      )

      if (res.ok) {
        return { data: mapPermissionRequest(await res.json()) }
      }
    } catch {
      // Fall through to local mock state when the API is unavailable.
    }
  }

  const idx = permissionStore.findIndex((r) => r.id === id)
  if (idx === -1) return { error: "Request not found." }
  const current = permissionStore[idx]
  if (!current) return { error: "Request not found." }
  permissionStore[idx] = { ...current, status: "cancelled" }
  return { data: permissionStore[idx] }
}
