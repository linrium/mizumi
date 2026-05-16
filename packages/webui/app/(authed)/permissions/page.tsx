"use client"

import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Key01Icon,
  Mail01Icon,
  MoreHorizontalIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNowStrict } from "date-fns"
import type { ComponentProps } from "react"
import { useDeferredValue, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type RequestStatus = "pending" | "ready" | "needs-info" | "approved"
type RequestScope = "catalog" | "schema" | "table"
type RiskLevel = "low" | "medium" | "high"

type PermissionRequest = {
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
}

const MOCK_REQUESTS: PermissionRequest[] = [
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

const FILTERS = [
  { key: "all", label: "All requests" },
  { key: "pending", label: "Pending" },
  { key: "ready", label: "Grant-ready" },
  { key: "needs-info", label: "Needs info" },
  { key: "approved", label: "Approved" },
] as const

function getStatusVariant(status: RequestStatus) {
  switch (status) {
    case "approved":
      return "success"
    case "ready":
      return "info"
    case "needs-info":
      return "warning"
    default:
      return "default"
  }
}

function getRiskBadgeVariant(risk: RiskLevel) {
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
    case "needs-info":
      return "Needs info"
    case "ready":
      return "Grant-ready"
    default:
      return status[0]?.toUpperCase() + status.slice(1)
  }
}

function formatScopeLabel(scope: RequestScope) {
  return scope[0]?.toUpperCase() + scope.slice(1)
}

export default function PermissionsPage() {
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTERS)[number]["key"]>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const filteredRequests = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase()

    return MOCK_REQUESTS.filter((request) => {
      const matchesFilter =
        activeFilter === "all" ? true : request.status === activeFilter
      const matchesSearch =
        search.length === 0
          ? true
          : [
              request.id,
              request.requester,
              request.team,
              request.resource,
              request.reviewer,
              request.rationale,
              ...request.privileges,
            ].some((value) => value.toLowerCase().includes(search))

      return matchesFilter && matchesSearch
    })
  }, [activeFilter, deferredQuery])

  const summary = useMemo(() => {
    const open = MOCK_REQUESTS.filter((item) => item.status !== "approved")
    const expiringSoon = MOCK_REQUESTS.filter((item) => item.expiresInDays <= 3)
    const highImpact = MOCK_REQUESTS.filter((item) => item.risk === "high")
    const grantReady = MOCK_REQUESTS.filter((item) => item.status === "ready")

    return {
      open: open.length,
      expiringSoon: expiringSoon.length,
      highImpact: highImpact.length,
      grantReady: grantReady.length,
    }
  }, [])

  const allVisibleSelected =
    filteredRequests.length > 0 &&
    filteredRequests.every((request) => selectedIds.includes(request.id))

  function toggleSelected(requestId: string) {
    setSelectedIds((current) =>
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId],
    )
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      if (!checked) {
        return current.filter(
          (id) => !filteredRequests.some((request) => request.id === id),
        )
      }

      const next = new Set(current)
      for (const request of filteredRequests) next.add(request.id)
      return [...next]
    })
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_28%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="flex flex-col gap-4 rounded-2xl border bg-background/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                <HugeiconsIcon icon={Shield01Icon} size={14} />
                Review lane
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Permission requests
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Triage inbound access requests, spot high-risk grants, and
                  keep temporary access from lingering.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryCard
                label="Open queue"
                value={summary.open}
                hint="Needs reviewer action"
                icon={Clock01Icon}
              />
              <SummaryCard
                label="Expiring soon"
                value={summary.expiringSoon}
                hint="Within 72 hours"
                icon={ArrowUpRight01Icon}
              />
              <SummaryCard
                label="High impact"
                value={summary.highImpact}
                hint="Catalog write or broad scope"
                icon={Key01Icon}
              />
              <SummaryCard
                label="Grant-ready"
                value={summary.grantReady}
                hint="Safe to batch approve"
                icon={CheckmarkCircle01Icon}
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border bg-background p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search request ID, requester, resource, or privilege"
                    className="md:max-w-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    {FILTERS.map((filter) => (
                      <Button
                        key={filter.key}
                        type="button"
                        variant={
                          activeFilter === filter.key ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setActiveFilter(filter.key)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm">
                    Export queue
                  </Button>
                  <Button type="button" size="sm">
                    New access policy
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Queue health</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mock workflow ideas baked into the UI.
                  </p>
                </div>
                <Badge variant="outline">prototype</Badge>
              </div>
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <p>
                  `3` requests are waiting on security review and `2` could be
                  auto-approved if policy templates existed.
                </p>
                <p>
                  Add later: policy diff previews, entitlement history, and
                  approval recipes by team.
                </p>
              </div>
            </div>
          </div>
        </section>

        {selectedIds.length > 0 ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">
                {selectedIds.length} request
                {selectedIds.length === 1 ? "" : "s"} selected
              </p>
              <p className="text-xs text-muted-foreground">
                Mock bulk actions help validate the review flow before wiring in
                real APIs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm">
                Approve selected
              </Button>
              <Button type="button" variant="outline" size="sm">
                Request details
              </Button>
              <Button type="button" variant="ghost" size="sm">
                Clear
              </Button>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Request queue</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {filteredRequests.length} visible request
              {filteredRequests.length === 1 ? "" : "s"}
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) =>
                      toggleAllVisible(checked === true)
                    }
                    aria-label="Select all visible requests"
                  />
                </TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Privileges</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((request) => {
                const isSelected = selectedIds.includes(request.id)
                const submittedLabel = formatDistanceToNowStrict(
                  new Date(request.submittedAt),
                  { addSuffix: true },
                )

                return (
                  <TableRow
                    key={request.id}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(
                      request.risk === "high" && "bg-destructive/5",
                      request.expiresInDays <= 2 &&
                        "border-l-2 border-l-primary",
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(request.id)}
                        aria-label={`Select ${request.id}`}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {request.requester}
                          </span>
                          <Badge variant="outline">{request.id}</Badge>
                        </div>
                        <div className="text-muted-foreground">
                          {request.team}
                        </div>
                        <div className="line-clamp-2 max-w-[28ch] text-muted-foreground">
                          {request.rationale}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <div className="font-mono text-[11px]">
                          {request.resource}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {formatScopeLabel(request.scope)}
                          </Badge>
                          <Badge variant={getRiskBadgeVariant(request.risk)}>
                            {request.risk} risk
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex max-w-[24ch] flex-wrap gap-1">
                        {request.privileges.map((privilege) => (
                          <Badge key={privilege} variant="outline">
                            {privilege}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Status variant={getStatusVariant(request.status)}>
                        <StatusIndicator />
                        <StatusLabel>
                          {formatStatusLabel(request.status)}
                        </StatusLabel>
                      </Status>
                      <div className="mt-2 text-muted-foreground">
                        Submitted {submittedLabel}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <div className="font-medium">{request.reviewer}</div>
                        <div className="inline-flex items-center gap-1 text-muted-foreground">
                          <HugeiconsIcon icon={Mail01Icon} size={13} />
                          Reviewer notified
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">
                        {request.expiresInDays <= 0
                          ? "Expired"
                          : `${request.expiresInDays} day${
                              request.expiresInDays === 1 ? "" : "s"
                            }`}
                      </div>
                      <div className="text-muted-foreground">
                        {request.expiresInDays <= 2
                          ? "Escalate today"
                          : "Within policy window"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon-sm">
                            <HugeiconsIcon
                              icon={MoreHorizontalIcon}
                              size={14}
                            />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem>Approve request</DropdownMenuItem>
                          <DropdownMenuItem>
                            Ask for more context
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            View entitlement history
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}

              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No permission requests match the current filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <IdeaCard
            title="Policy templates"
            description="Pre-fill privilege bundles by team and resource type so common requests can be approved with one click."
          />
          <IdeaCard
            title="Blast-radius preview"
            description="Show downstream tables, dashboards, and owners affected by each grant before approval."
          />
          <IdeaCard
            title="Time-bound access"
            description="Default high-risk grants to auto-expire, then highlight renewals separately from net-new access."
          />
        </section>
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ComponentProps<typeof HugeiconsIcon>["icon"]
  label: string
  value: number
  hint: string
}) {
  return (
    <div className="rounded-xl border bg-card px-3 py-3">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-medium">{label}</span>
        <HugeiconsIcon icon={icon} size={14} />
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  )
}

function IdeaCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
