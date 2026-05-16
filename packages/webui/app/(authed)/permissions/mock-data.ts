export type RequestStatus = "pending" | "ready" | "needs-info" | "approved"
export type RequestScope = "catalog" | "schema" | "table"
export type RiskLevel = "low" | "medium" | "high"

export type PermissionRequest = {
  id: string
  requester: string
  team: string
  resource: string
  scope: RequestScope
  privileges: string[]
  submittedAt: string
  status: RequestStatus
  reviewer: string
  rationale: string
  expiresInDays: number
  risk: RiskLevel
  policyTemplateId?: string
  policyTemplateName?: string
  policyTemplateResource?: string | null
  policyTemplateApprovalMode?: "auto" | "review" | "escalate"
  policyTemplateOwnerId?: string
  policyTemplateOwner?: string
  queueDecision?:
    | "auto-approved"
    | "reviewer-gate"
    | "security-escalation"
    | "manual-review"
}

export type PolicyTemplate = {
  id: string
  name: string
  scope: RequestScope
  resource: string | null
  teamIds: string[]
  teams: string[]
  privileges: string[]
  approvalMode: "auto" | "review" | "escalate"
  risk: RiskLevel
  usage30d: number
  ownerId: string
  owner: string
  lastUpdated: string
}

export type BlastRadiusPreview = {
  requestId: string
  requester: string
  resource: string
  scope: RequestScope
  risk: RiskLevel
  downstreamAssets: number
  dashboards: number
  consumers: number
  sensitiveDomains: string[]
  recommendedGuardrail: string
}

export type TimeBoundGrant = {
  grantId: string
  principal: string
  team: string
  resource: string
  privilege: string
  startedAt: string
  expiresAt: string
  reviewer: string
  renewalStatus: "healthy" | "expiring" | "expired"
  reason: string
}

export const MOCK_REQUESTS: PermissionRequest[] = [
  {
    id: "PR-1042",
    requester: "Annie Case",
    team: "Fraud Ops",
    resource: "risk.gold_chargebacks",
    scope: "table",
    privileges: ["SELECT", "MODIFY"],
    submittedAt: "2026-05-16T01:12:00.000Z",
    status: "pending",
    reviewer: "Data Platform",
    rationale: "Investigating a spike in dispute reversals for the Japan lane.",
    expiresInDays: 1,
    risk: "high",
  },
  {
    id: "PR-1041",
    requester: "Mai Nguyen",
    team: "Growth Analytics",
    resource: "marketing",
    scope: "catalog",
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    submittedAt: "2026-05-15T06:30:00.000Z",
    status: "ready",
    reviewer: "Governance",
    rationale: "Standing up a campaign-attribution sandbox for a new partner.",
    expiresInDays: 5,
    risk: "medium",
  },
  {
    id: "PR-1039",
    requester: "Kenji Mori",
    team: "Finance BI",
    resource: "finance.ap_closure",
    scope: "schema",
    privileges: ["USE_SCHEMA", "SELECT"],
    submittedAt: "2026-05-14T10:00:00.000Z",
    status: "approved",
    reviewer: "Minh Tran",
    rationale: "Month-end close support for vendor accrual reconciliation.",
    expiresInDays: 14,
    risk: "low",
  },
  {
    id: "PR-1038",
    requester: "Nora Patel",
    team: "ML Platform",
    resource: "feature_store.user_embeddings",
    scope: "table",
    privileges: ["SELECT"],
    submittedAt: "2026-05-14T02:48:00.000Z",
    status: "needs-info",
    reviewer: "Security",
    rationale: "Model retraining run needs a narrower cohort definition.",
    expiresInDays: 3,
    risk: "medium",
  },
  {
    id: "PR-1036",
    requester: "Bao Ho",
    team: "Operations",
    resource: "ops.runbooks",
    scope: "schema",
    privileges: ["USE_SCHEMA", "SELECT", "MODIFY"],
    submittedAt: "2026-05-13T08:15:00.000Z",
    status: "pending",
    reviewer: "Data Steward",
    rationale: "Support rotation needs edit access for incident annotations.",
    expiresInDays: 2,
    risk: "high",
  },
  {
    id: "PR-1034",
    requester: "Linh Vu",
    team: "Executive Analytics",
    resource: "board_metrics",
    scope: "catalog",
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    submittedAt: "2026-05-12T09:10:00.000Z",
    status: "ready",
    reviewer: "Data Platform",
    rationale: "Dedicated exec reporting workspace for Q2 operating review.",
    expiresInDays: 7,
    risk: "medium",
  },
  {
    id: "PR-1031",
    requester: "Haruto Sato",
    team: "Support Intelligence",
    resource: "support.ticket_embeddings",
    scope: "table",
    privileges: ["SELECT"],
    submittedAt: "2026-05-11T23:40:00.000Z",
    status: "pending",
    reviewer: "Security",
    rationale: "Case clustering pilot for deflection opportunities.",
    expiresInDays: 9,
    risk: "low",
  },
]

export const MOCK_POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "PT-001",
    name: "Analytics read sandbox",
    scope: "schema",
    resource: null,
    teamIds: [
      "10000000-0000-0000-0000-000000000002",
      "10000000-0000-0000-0000-000000000003",
      "10000000-0000-0000-0000-000000000007",
    ],
    teams: ["Growth Analytics", "Finance BI", "Executive Analytics"],
    privileges: ["USE_SCHEMA", "SELECT"],
    approvalMode: "auto",
    risk: "low",
    usage30d: 28,
    ownerId: "10000000-0000-0000-0000-000000000009",
    owner: "Governance",
    lastUpdated: "2026-05-12T09:00:00.000Z",
  },
  {
    id: "PT-002",
    name: "Operational writeback",
    scope: "table",
    resource: "risk.gold_chargebacks",
    teamIds: [
      "10000000-0000-0000-0000-000000000005",
      "10000000-0000-0000-0000-000000000001",
    ],
    teams: ["Operations", "Fraud Ops"],
    privileges: ["SELECT", "MODIFY"],
    approvalMode: "review",
    risk: "high",
    usage30d: 9,
    ownerId: "10000000-0000-0000-0000-000000000011",
    owner: "Data Steward",
    lastUpdated: "2026-05-09T15:30:00.000Z",
  },
  {
    id: "PT-003",
    name: "Catalog bootstrap",
    scope: "catalog",
    resource: "marketing",
    teamIds: [
      "10000000-0000-0000-0000-000000000002",
      "10000000-0000-0000-0000-000000000004",
    ],
    teams: ["Growth Analytics", "ML Platform"],
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    approvalMode: "review",
    risk: "medium",
    usage30d: 6,
    ownerId: "10000000-0000-0000-0000-000000000006",
    owner: "Data Platform",
    lastUpdated: "2026-05-10T05:10:00.000Z",
  },
  {
    id: "PT-004",
    name: "Sensitive feature access",
    scope: "table",
    resource: "feature_store.user_embeddings",
    teamIds: ["10000000-0000-0000-0000-000000000004"],
    teams: ["ML Platform"],
    privileges: ["SELECT"],
    approvalMode: "escalate",
    risk: "high",
    usage30d: 4,
    ownerId: "10000000-0000-0000-0000-000000000010",
    owner: "Security",
    lastUpdated: "2026-05-14T02:20:00.000Z",
  },
]

export const MOCK_BLAST_RADIUS: BlastRadiusPreview[] = [
  {
    requestId: "PR-1042",
    requester: "Annie Case",
    resource: "risk.gold_chargebacks",
    scope: "table",
    risk: "high",
    downstreamAssets: 14,
    dashboards: 6,
    consumers: 3,
    sensitiveDomains: ["payments", "fraud"],
    recommendedGuardrail: "Time-box to 24h and block export permissions.",
  },
  {
    requestId: "PR-1041",
    requester: "Mai Nguyen",
    resource: "marketing",
    scope: "catalog",
    risk: "medium",
    downstreamAssets: 9,
    dashboards: 4,
    consumers: 2,
    sensitiveDomains: ["attribution"],
    recommendedGuardrail: "Restrict creation to prefixed schemas only.",
  },
  {
    requestId: "PR-1038",
    requester: "Nora Patel",
    resource: "feature_store.user_embeddings",
    scope: "table",
    risk: "medium",
    downstreamAssets: 21,
    dashboards: 0,
    consumers: 5,
    sensitiveDomains: ["ml", "user-profile"],
    recommendedGuardrail: "Require cohort filter and sampled read path.",
  },
  {
    requestId: "PR-1036",
    requester: "Bao Ho",
    resource: "ops.runbooks",
    scope: "schema",
    risk: "high",
    downstreamAssets: 7,
    dashboards: 2,
    consumers: 4,
    sensitiveDomains: ["ops"],
    recommendedGuardrail: "Mirror writes to audit log and enforce row tags.",
  },
]

export const MOCK_TIME_BOUND_GRANTS: TimeBoundGrant[] = [
  {
    grantId: "TG-2204",
    principal: "Annie Case",
    team: "Fraud Ops",
    resource: "risk.gold_chargebacks",
    privilege: "MODIFY",
    startedAt: "2026-05-15T00:00:00.000Z",
    expiresAt: "2026-05-17T00:00:00.000Z",
    reviewer: "Data Platform",
    renewalStatus: "expiring",
    reason: "Chargeback investigation burst window.",
  },
  {
    grantId: "TG-2201",
    principal: "Nora Patel",
    team: "ML Platform",
    resource: "feature_store.user_embeddings",
    privilege: "SELECT",
    startedAt: "2026-05-10T00:00:00.000Z",
    expiresAt: "2026-05-18T00:00:00.000Z",
    reviewer: "Security",
    renewalStatus: "healthy",
    reason: "Model retraining run with approved cohort filter.",
  },
  {
    grantId: "TG-2198",
    principal: "Bao Ho",
    team: "Operations",
    resource: "ops.runbooks",
    privilege: "MODIFY",
    startedAt: "2026-05-09T00:00:00.000Z",
    expiresAt: "2026-05-16T00:00:00.000Z",
    reviewer: "Data Steward",
    renewalStatus: "expired",
    reason: "Support rotation annotation backfill.",
  },
  {
    grantId: "TG-2194",
    principal: "Linh Vu",
    team: "Executive Analytics",
    resource: "board_metrics",
    privilege: "CREATE_SCHEMA",
    startedAt: "2026-05-12T00:00:00.000Z",
    expiresAt: "2026-05-22T00:00:00.000Z",
    reviewer: "Data Platform",
    renewalStatus: "healthy",
    reason: "Q2 operating review workspace.",
  },
]
