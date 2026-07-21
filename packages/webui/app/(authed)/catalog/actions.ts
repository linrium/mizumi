"use server"

import { getServerSession } from "@/lib/auth"
import {
  getCatalogs,
  getEffectivePrivileges,
  getModel,
  getModels,
  getModelVersions,
  getPermissions,
  getSchemas,
  getTable,
  getTables,
  getVolume,
  getVolumes,
  patchPermissions,
} from "@/services/catalog"
import type { MlflowRun } from "@/services/mlflow"
import {
  getRun,
  listTraces,
  searchExperiments,
  searchLoggedModels,
  searchRuns,
} from "@/services/mlflow"
import type {
  PermissionApprovalStep,
  RequestScope,
  RequestStatus,
  RiskLevel,
} from "@/services/permissions"
import { listS3Objects } from "@/services/rustfs"

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000"
const DEFAULT_REVIEWER_ID = "10000000-0000-0000-0000-000000000004"
const DEFAULT_REVIEWER_NAME = "HDBank Data Steward"
const DEFAULT_REQUEST_TEAM_ID = "10000000-0000-0000-0000-000000000002"

const TEAM_IDS_BY_NAME: Record<string, string> = {
  "VietJetair Analytics": "10000000-0000-0000-0000-000000000001",
  "VietJetair Data Platform": "10000000-0000-0000-0000-000000000002",
  "HDBank Risk Analytics": "10000000-0000-0000-0000-000000000003",
  "HDBank Data Steward": "10000000-0000-0000-0000-000000000004",
  "HDBank Security": "10000000-0000-0000-0000-000000000005",
  "Partnership Data Platform": "10000000-0000-0000-0000-000000000006",
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

export async function getVolumesAction(catalog: string, schema: string) {
  return getVolumes(catalog, schema)
}

export async function getVolumeAction(
  catalog: string,
  schema: string,
  volume: string
) {
  return getVolume(catalog, schema, volume)
}

export async function listVolumeFilesAction(
  storageLocation: string,
  continuationToken?: string
) {
  const match = storageLocation.match(/^s3:\/\/([^/]+)\/(.+)$/)
  if (!match) throw new Error(`Invalid storage location: ${storageLocation}`)
  const [, bucket, prefix] = match as [string, string, string]
  return listS3Objects(bucket, prefix, { continuationToken })
}

export async function getModelsAction(catalog: string, schema: string) {
  return getModels(catalog, schema)
}

export async function getModelAction(
  catalog: string,
  schema: string,
  model: string
) {
  return getModel(catalog, schema, model)
}

export async function getModelVersionsAction(
  catalog: string,
  schema: string,
  model: string
) {
  return getModelVersions(catalog, schema, model)
}

export async function searchMlflowExperimentsAction() {
  try {
    return await searchExperiments()
  } catch {
    return { experiments: [] }
  }
}

export async function searchMlflowRunsAction(
  experimentIds: string[],
  options?: { registeredModelUri?: string }
) {
  try {
    return await searchRuns(experimentIds, options)
  } catch {
    return { runs: [] }
  }
}

export async function searchMlflowLoggedModelsAction() {
  try {
    return await searchLoggedModels()
  } catch {
    return { models: [] }
  }
}

export async function getMlflowRunsForVersionsAction(runIds: string[]) {
  const unique = [...new Set(runIds.filter(Boolean))]
  const results = await Promise.allSettled(unique.map((id) => getRun(id)))
  return results
    .filter(
      (r): r is PromiseFulfilledResult<{ run: MlflowRun }> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value.run)
}

export async function listMlflowTracesAction(experimentId: string) {
  try {
    return await listTraces(experimentId)
  } catch {
    return { traces: [] }
  }
}

export async function getTableAction(
  catalog: string,
  schema: string,
  table: string
) {
  return getTable(catalog, schema, table)
}

export async function getPermissionsAction(
  resourceType: "catalog" | "schema" | "table",
  catalog: string,
  schema?: string,
  table?: string
) {
  return getPermissions(resourceType, catalog, schema, table)
}

export async function getMyPrivilegesAction(
  resourceType: "catalog" | "schema" | "table",
  catalog: string,
  schema?: string,
  table?: string
): Promise<string[]> {
  try {
    return await getEffectivePrivileges(resourceType, catalog, schema, table)
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
  submit_as?: "personal" | "team"
  requester: string
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
  renewal_of: string | null
  approval_steps: PermissionApprovalStep[]
  current_approval_step_id: string | null
  queue_decision:
    | "auto-approved"
    | "time-bounded"
    | "security-escalation"
    | "manual-review"
}

export type MyTeamOption = {
  id: string
  name: string
}

export type RequestSubmitAs = "personal" | "team"

const permissionStore: StoredPermissionRequest[] = [
  {
    id: "PR-1042",
    code: "PR-1042",
    submit_as: "team",
    requester: "Khao Pad",
    team: "HDBank Risk Analytics",
    resource: "hdbank.hdbank_payments_prod_gold.risk_detection_v1",
    scope: "table",
    privileges: ["SELECT", "MODIFY"],
    submitted_at: "2026-05-16T01:12:00.000Z",
    expires_at: "2026-05-17T01:12:00.000Z",
    expires_in_days: 1,
    status: "pending",
    reviewer: "HDBank Data Steward",
    rationale:
      "Temporary write access is needed to validate chargeback risk thresholds before the next fraud release.",
    risk: "high",
    policy_template_id: "40000000-0000-0000-0000-000000000004",
    policy_template_name: "HDBank chargeback writeback",
    policy_template_resource:
      "hdbank.hdbank_payments_prod_gold.risk_detection_v1",
    policy_template_approval_mode: "escalate",
    policy_template_owner_id: "10000000-0000-0000-0000-000000000005",
    policy_template_owner: "HDBank Security",
    renewal_of: null,
    approval_steps: [
      {
        id: "step-1042-1",
        stage_order: 1,
        approver_team_id: "10000000-0000-0000-0000-000000000004",
        approver_team: "HDBank Data Steward",
        approver_label: "Data steward review",
        status: "approved",
        acted_at: "2026-05-16T02:00:00.000Z",
        is_current: false,
      },
      {
        id: "step-1042-2",
        stage_order: 2,
        approver_team_id: "10000000-0000-0000-0000-000000000005",
        approver_team: "HDBank Security",
        approver_label: "Security sign-off",
        status: "pending",
        acted_at: null,
        is_current: true,
      },
    ],
    current_approval_step_id: "step-1042-2",
    queue_decision: "time-bounded",
  },
  {
    id: "PR-1041",
    code: "PR-1041",
    submit_as: "team",
    requester: "Linh Tran",
    team: "VietJetair Analytics",
    resource: "partnership_sandbox.analytics",
    scope: "schema",
    privileges: ["USE_SCHEMA", "SELECT"],
    submitted_at: "2026-05-15T06:30:00.000Z",
    expires_at: "2026-05-21T06:30:00.000Z",
    expires_in_days: 6,
    status: "ready",
    reviewer: "Partnership Data Platform",
    rationale:
      "Preparing a joint VietJet and HDBank partner performance readout for the weekly business review.",
    risk: "medium",
    policy_template_id: "40000000-0000-0000-0000-000000000003",
    policy_template_name: "Partner analytics read",
    policy_template_resource: "partnership_sandbox.analytics",
    policy_template_approval_mode: "review",
    policy_template_owner_id: "10000000-0000-0000-0000-000000000006",
    policy_template_owner: "Partnership Data Platform",
    renewal_of: null,
    approval_steps: [
      {
        id: "step-1041-1",
        stage_order: 1,
        approver_team_id: "10000000-0000-0000-0000-000000000006",
        approver_team: "Partnership Data Platform",
        approver_label: "Workspace owner review",
        status: "pending",
        acted_at: null,
        is_current: true,
      },
      {
        id: "step-1041-2",
        stage_order: 2,
        approver_team_id: "10000000-0000-0000-0000-000000000004",
        approver_team: "HDBank Data Steward",
        approver_label: "Data steward review",
        status: "waiting",
        acted_at: null,
        is_current: false,
      },
    ],
    current_approval_step_id: "step-1041-1",
    queue_decision: "time-bounded",
  },
  {
    id: "PR-1039",
    code: "PR-1039",
    submit_as: "team",
    requester: "Khao Soi",
    team: "VietJetair Analytics",
    resource: "vietjetair_sandbox.vietjetair_bookings_sandbox_gold",
    scope: "schema",
    privileges: ["USE_SCHEMA", "SELECT"],
    submitted_at: "2026-05-14T10:00:00.000Z",
    expires_at: "2026-05-30T10:00:00.000Z",
    expires_in_days: 14,
    status: "approved",
    reviewer: "VietJetair Data Platform",
    rationale:
      "Sandbox access for route-performance experimentation during the fare optimization sprint.",
    risk: "low",
    policy_template_id: "40000000-0000-0000-0000-000000000001",
    policy_template_name: "VietJet sandbox read",
    policy_template_resource:
      "vietjetair_sandbox.vietjetair_bookings_sandbox_gold",
    policy_template_approval_mode: "auto",
    policy_template_owner_id: "10000000-0000-0000-0000-000000000002",
    policy_template_owner: "VietJetair Data Platform",
    renewal_of: null,
    approval_steps: [],
    current_approval_step_id: null,
    queue_decision: "auto-approved",
  },
]

type PermissionRequestApiResponse = {
  id: string
  code: string
  submit_as: "personal" | "team"
  requester_id: string
  requester: string
  requester_email: string
  team_id: string | null
  team: string | null
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
  renewal_of: string | null
  approval_steps: PermissionApprovalStep[]
  current_approval_step_id: string | null
  queue_decision:
    | "auto-approved"
    | "time-bounded"
    | "security-escalation"
    | "manual-review"
}

function mapPermissionRequest(
  request: PermissionRequestApiResponse
): StoredPermissionRequest {
  return {
    id: request.id,
    code: request.code,
    submit_as: request.submit_as,
    requester: request.requester,
    team_id: request.team_id,
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
    renewal_of: request.renewal_of,
    approval_steps: request.approval_steps,
    current_approval_step_id: request.current_approval_step_id,
    queue_decision: request.queue_decision,
  }
}

export async function listMyTeamsAction(): Promise<MyTeamOption[]> {
  const session = await getServerSession()

  if (!session?.idToken) {
    const fallbackTeamId = resolveRequesterTeamId(session?.groups)
    const fallbackTeamName =
      Object.entries(TEAM_IDS_BY_NAME).find(
        ([, id]) => id === fallbackTeamId
      )?.[0] ?? "VietJetair Data Platform"
    return [{ id: fallbackTeamId, name: fallbackTeamName }]
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/users/me/teams`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.idToken}`,
      },
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const body = (await res.json()) as { teams: MyTeamOption[] }
    if (body.teams.length > 0) {
      return body.teams
    }
  } catch {
    // Fall through to session-group fallback when the API is unavailable.
  }

  const fallbackTeamId = resolveRequesterTeamId(session.groups)
  const fallbackTeamName =
    Object.entries(TEAM_IDS_BY_NAME).find(
      ([, id]) => id === fallbackTeamId
    )?.[0] ?? "VietJetair Data Platform"
  return [{ id: fallbackTeamId, name: fallbackTeamName }]
}

export async function listPermissionRequestsAction(
  resource: string
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
  submitAs: RequestSubmitAs
  teamId?: string
  resource: string
  scope: RequestScope
  privileges: string[]
  rationale: string
  requestedDurationDays?: number
  renewalOf?: string
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
    const res = await fetch(`${API_BASE_URL}/api/permissions/requests`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requester_id: session.sub,
        submit_as: body.submitAs,
        team: body.submitAs === "team" ? body.teamId : null,
        resource: body.resource,
        scope: body.scope,
        privileges: body.privileges,
        rationale: body.rationale,
        ...(body.requestedDurationDays != null && {
          requested_duration_days: body.requestedDurationDays,
        }),
        ...(body.renewalOf != null && { renewal_of: body.renewalOf }),
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
  id: string
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
        }
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
