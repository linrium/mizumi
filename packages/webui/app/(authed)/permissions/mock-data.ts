export type RequestStatus = "pending" | "ready" | "needs-info" | "approved"
export type RequestScope = "catalog" | "schema" | "table"
export type RiskLevel = "low" | "medium" | "high"

export interface PermissionRequest {
  expiresInDays: number
  id: string
  policyTemplateApprovalMode?: "auto" | "review" | "escalate"
  policyTemplateId?: string
  policyTemplateName?: string
  policyTemplateOwner?: string
  policyTemplateOwnerId?: string
  policyTemplateResource?: string | null
  privileges: string[]
  queueDecision?:
    | "auto-approved"
    | "reviewer-gate"
    | "security-escalation"
    | "manual-review"
  rationale: string
  requester: string
  resource: string
  reviewer: string
  risk: RiskLevel
  scope: RequestScope
  status: RequestStatus
  submittedAt: string
  team: string
}

export interface PolicyTemplate {
  approvalMode: "auto" | "review" | "escalate"
  id: string
  lastUpdated: string
  name: string
  owner: string
  ownerId: string
  privileges: string[]
  resource: string | null
  risk: RiskLevel
  scope: RequestScope
  teamIds: string[]
  teams: string[]
  usage30d: number
}

export interface BlastRadiusPreview {
  consumers: number
  dashboards: number
  downstreamAssets: number
  recommendedGuardrail: string
  requester: string
  requestId: string
  resource: string
  risk: RiskLevel
  scope: RequestScope
  sensitiveDomains: string[]
}

export interface TimeBoundGrant {
  expiresAt: string
  grantId: string
  principal: string
  privilege: string
  reason: string
  renewalStatus: "healthy" | "expiring" | "expired"
  resource: string
  reviewer: string
  startedAt: string
  team: string
}

export const MOCK_REQUESTS: PermissionRequest[] = [
  {
    expiresInDays: 1,
    id: "PR-1042",
    privileges: ["SELECT", "MODIFY"],
    rationale: "Investigating a spike in dispute reversals for the Japan lane.",
    requester: "Annie Case",
    resource: "risk.gold_chargebacks",
    reviewer: "Data Platform",
    risk: "high",
    scope: "table",
    status: "pending",
    submittedAt: "2026-05-16T01:12:00.000Z",
    team: "Fraud Ops",
  },
  {
    expiresInDays: 5,
    id: "PR-1041",
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    rationale: "Standing up a campaign-attribution sandbox for a new partner.",
    requester: "Mai Nguyen",
    resource: "marketing",
    reviewer: "Governance",
    risk: "medium",
    scope: "catalog",
    status: "ready",
    submittedAt: "2026-05-15T06:30:00.000Z",
    team: "Growth Analytics",
  },
  {
    expiresInDays: 14,
    id: "PR-1039",
    privileges: ["USE_SCHEMA", "SELECT"],
    rationale: "Month-end close support for vendor accrual reconciliation.",
    requester: "Kenji Mori",
    resource: "finance.ap_closure",
    reviewer: "Minh Tran",
    risk: "low",
    scope: "schema",
    status: "approved",
    submittedAt: "2026-05-14T10:00:00.000Z",
    team: "Finance BI",
  },
  {
    expiresInDays: 3,
    id: "PR-1038",
    privileges: ["SELECT"],
    rationale: "Model retraining run needs a narrower cohort definition.",
    requester: "Nora Patel",
    resource: "feature_store.user_embeddings",
    reviewer: "Security",
    risk: "medium",
    scope: "table",
    status: "needs-info",
    submittedAt: "2026-05-14T02:48:00.000Z",
    team: "ML Platform",
  },
  {
    expiresInDays: 2,
    id: "PR-1036",
    privileges: ["USE_SCHEMA", "SELECT", "MODIFY"],
    rationale: "Support rotation needs edit access for incident annotations.",
    requester: "Bao Ho",
    resource: "ops.runbooks",
    reviewer: "Data Steward",
    risk: "high",
    scope: "schema",
    status: "pending",
    submittedAt: "2026-05-13T08:15:00.000Z",
    team: "Operations",
  },
  {
    expiresInDays: 7,
    id: "PR-1034",
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    rationale: "Dedicated exec reporting workspace for Q2 operating review.",
    requester: "Linh Vu",
    resource: "board_metrics",
    reviewer: "Data Platform",
    risk: "medium",
    scope: "catalog",
    status: "ready",
    submittedAt: "2026-05-12T09:10:00.000Z",
    team: "Executive Analytics",
  },
  {
    expiresInDays: 9,
    id: "PR-1031",
    privileges: ["SELECT"],
    rationale: "Case clustering pilot for deflection opportunities.",
    requester: "Haruto Sato",
    resource: "support.ticket_embeddings",
    reviewer: "Security",
    risk: "low",
    scope: "table",
    status: "pending",
    submittedAt: "2026-05-11T23:40:00.000Z",
    team: "Support Intelligence",
  },
]

export const MOCK_POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    approvalMode: "auto",
    id: "PT-001",
    lastUpdated: "2026-05-12T09:00:00.000Z",
    name: "Analytics read sandbox",
    owner: "Governance",
    ownerId: "10000000-0000-0000-0000-000000000009",
    privileges: ["USE_SCHEMA", "SELECT"],
    resource: null,
    risk: "low",
    scope: "schema",
    teamIds: [
      "10000000-0000-0000-0000-000000000002",
      "10000000-0000-0000-0000-000000000003",
      "10000000-0000-0000-0000-000000000007",
    ],
    teams: ["Growth Analytics", "Finance BI", "Executive Analytics"],
    usage30d: 28,
  },
  {
    approvalMode: "review",
    id: "PT-002",
    lastUpdated: "2026-05-09T15:30:00.000Z",
    name: "Operational writeback",
    owner: "Data Steward",
    ownerId: "10000000-0000-0000-0000-000000000011",
    privileges: ["SELECT", "MODIFY"],
    resource: "risk.gold_chargebacks",
    risk: "high",
    scope: "table",
    teamIds: [
      "10000000-0000-0000-0000-000000000005",
      "10000000-0000-0000-0000-000000000001",
    ],
    teams: ["Operations", "Fraud Ops"],
    usage30d: 9,
  },
  {
    approvalMode: "review",
    id: "PT-003",
    lastUpdated: "2026-05-10T05:10:00.000Z",
    name: "Catalog bootstrap",
    owner: "Data Platform",
    ownerId: "10000000-0000-0000-0000-000000000006",
    privileges: ["USE_CATALOG", "CREATE_SCHEMA"],
    resource: "marketing",
    risk: "medium",
    scope: "catalog",
    teamIds: [
      "10000000-0000-0000-0000-000000000002",
      "10000000-0000-0000-0000-000000000004",
    ],
    teams: ["Growth Analytics", "ML Platform"],
    usage30d: 6,
  },
  {
    approvalMode: "escalate",
    id: "PT-004",
    lastUpdated: "2026-05-14T02:20:00.000Z",
    name: "Sensitive feature access",
    owner: "Security",
    ownerId: "10000000-0000-0000-0000-000000000010",
    privileges: ["SELECT"],
    resource: "feature_store.user_embeddings",
    risk: "high",
    scope: "table",
    teamIds: ["10000000-0000-0000-0000-000000000004"],
    teams: ["ML Platform"],
    usage30d: 4,
  },
]

export const MOCK_BLAST_RADIUS: BlastRadiusPreview[] = [
  {
    consumers: 3,
    dashboards: 6,
    downstreamAssets: 14,
    recommendedGuardrail: "Time-box to 24h and block export permissions.",
    requester: "Annie Case",
    requestId: "PR-1042",
    resource: "risk.gold_chargebacks",
    risk: "high",
    scope: "table",
    sensitiveDomains: ["payments", "fraud"],
  },
  {
    consumers: 2,
    dashboards: 4,
    downstreamAssets: 9,
    recommendedGuardrail: "Restrict creation to prefixed schemas only.",
    requester: "Mai Nguyen",
    requestId: "PR-1041",
    resource: "marketing",
    risk: "medium",
    scope: "catalog",
    sensitiveDomains: ["attribution"],
  },
  {
    consumers: 5,
    dashboards: 0,
    downstreamAssets: 21,
    recommendedGuardrail: "Require cohort filter and sampled read path.",
    requester: "Nora Patel",
    requestId: "PR-1038",
    resource: "feature_store.user_embeddings",
    risk: "medium",
    scope: "table",
    sensitiveDomains: ["ml", "user-profile"],
  },
  {
    consumers: 4,
    dashboards: 2,
    downstreamAssets: 7,
    recommendedGuardrail: "Mirror writes to audit log and enforce row tags.",
    requester: "Bao Ho",
    requestId: "PR-1036",
    resource: "ops.runbooks",
    risk: "high",
    scope: "schema",
    sensitiveDomains: ["ops"],
  },
]

export const MOCK_TIME_BOUND_GRANTS: TimeBoundGrant[] = [
  {
    expiresAt: "2026-05-17T00:00:00.000Z",
    grantId: "TG-2204",
    principal: "Annie Case",
    privilege: "MODIFY",
    reason: "Chargeback investigation burst window.",
    renewalStatus: "expiring",
    resource: "risk.gold_chargebacks",
    reviewer: "Data Platform",
    startedAt: "2026-05-15T00:00:00.000Z",
    team: "Fraud Ops",
  },
  {
    expiresAt: "2026-05-18T00:00:00.000Z",
    grantId: "TG-2201",
    principal: "Nora Patel",
    privilege: "SELECT",
    reason: "Model retraining run with approved cohort filter.",
    renewalStatus: "healthy",
    resource: "feature_store.user_embeddings",
    reviewer: "Security",
    startedAt: "2026-05-10T00:00:00.000Z",
    team: "ML Platform",
  },
  {
    expiresAt: "2026-05-16T00:00:00.000Z",
    grantId: "TG-2198",
    principal: "Bao Ho",
    privilege: "MODIFY",
    reason: "Support rotation annotation backfill.",
    renewalStatus: "expired",
    resource: "ops.runbooks",
    reviewer: "Data Steward",
    startedAt: "2026-05-09T00:00:00.000Z",
    team: "Operations",
  },
  {
    expiresAt: "2026-05-22T00:00:00.000Z",
    grantId: "TG-2194",
    principal: "Linh Vu",
    privilege: "CREATE_SCHEMA",
    reason: "Q2 operating review workspace.",
    renewalStatus: "healthy",
    resource: "board_metrics",
    reviewer: "Data Platform",
    startedAt: "2026-05-12T00:00:00.000Z",
    team: "Executive Analytics",
  },
]
