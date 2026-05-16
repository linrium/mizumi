"use server"

import {
  getCatalogs,
  getPermissions,
  getSchemas,
  getTable,
  getTables,
  patchPermissions,
} from "@/services/catalog"
import { getServerSession } from "@/lib/auth"
import type { RequestScope, RequestStatus, RiskLevel } from "@/services/permissions"

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
      (a) => a.principal.toLowerCase() === session.email!.toLowerCase(),
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
}

let seq = 1043

const permissionStore: StoredPermissionRequest[] = [
  {
    id: "PR-1042",
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
  },
  {
    id: "PR-1041",
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
  },
  {
    id: "PR-1039",
    requester: "Kenji Mori",
    team: "Finance BI",
    resource: "finance.ap_closure",
    scope: "schema",
    privileges: ["USE_SCHEMA", "SELECT"],
    submitted_at: "2026-05-14T10:00:00.000Z",
    expires_at: "2026-05-28T10:00:00.000Z",
    expires_in_days: 14,
    status: "approved",
    reviewer: "Minh Tran",
    rationale: "Month-end close support for vendor accrual reconciliation.",
    risk: "low",
  },
]

export async function listPermissionRequestsAction(
  resource: string,
): Promise<StoredPermissionRequest[]> {
  return permissionStore.filter((r) => r.resource === resource)
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
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const req: StoredPermissionRequest = {
    id: `PR-${seq++}`,
    requester: "You",
    team: "",
    resource: body.resource,
    scope: body.scope,
    privileges: body.privileges,
    submitted_at: now,
    expires_at: expires,
    expires_in_days: 7,
    status: "pending",
    reviewer: "Data Platform",
    rationale: body.rationale,
    risk: "low",
  }
  permissionStore.unshift(req)
  return { data: req }
}

export async function cancelPermissionRequestAction(
  id: string,
): Promise<{ data?: StoredPermissionRequest; error?: string }> {
  const idx = permissionStore.findIndex((r) => r.id === id)
  if (idx === -1) return { error: "Request not found." }
  permissionStore[idx] = { ...permissionStore[idx]!, status: "cancelled" }
  return { data: permissionStore[idx] }
}
