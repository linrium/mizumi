"use client"

import {
  CheckmarkCircle01Icon,
  Key01Icon,
  Mail01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNowStrict } from "date-fns"
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
import {
  MOCK_REQUESTS,
  type RequestScope,
  type RequestStatus,
  type RiskLevel,
} from "./mock-data"

const FILTERS = [
  { key: "all", label: "All" },
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

  const stats = useMemo(() => {
    const pending = MOCK_REQUESTS.filter((item) => item.status === "pending")
    const ready = MOCK_REQUESTS.filter((item) => item.status === "ready")
    const expiringSoon = MOCK_REQUESTS.filter((item) => item.expiresInDays <= 3)
    const highRisk = MOCK_REQUESTS.filter((item) => item.risk === "high")

    return {
      pending: pending.length,
      ready: ready.length,
      expiringSoon: expiringSoon.length,
      highRisk: highRisk.length,
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">Permission requests</h1>
              <Badge variant="outline">{filteredRequests.length}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Review access grants, temporary exceptions, and renewals.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <Badge variant="outline">{stats.pending} pending</Badge>
          <Badge variant="outline">{stats.ready} grant-ready</Badge>
          <Badge variant="outline">{stats.expiringSoon} expiring soon</Badge>
          <Badge variant="outline">{stats.highRisk} high risk</Badge>
          <span className="text-xs text-muted-foreground">
            Mock ideas: auto-approve low-risk bundles, show policy diffs,
            default risky grants to time-bound access.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search request, resource, team, or privilege"
              className="w-full min-w-56 max-w-sm"
            />
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={cn(
                  "px-2.5 py-1.5 text-xs rounded border transition-colors",
                  activeFilter === filter.key
                    ? "border-foreground text-foreground bg-muted/60"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {selectedIds.length} selected
                </span>
                <Button type="button" size="sm">
                  Approve
                </Button>
                <Button type="button" variant="outline" size="sm">
                  Request details
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                2 requests could be auto-approved by policy template
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) =>
                    toggleAllVisible(checked === true)
                  }
                  aria-label="Select all visible requests"
                />
              </TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Privileges</TableHead>
              <TableHead>Reviewer</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.length > 0 ? (
              filteredRequests.map((request) => {
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
                          <span className="font-mono text-muted-foreground">
                            {request.id}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {request.team}
                        </div>
                        <div className="line-clamp-1 max-w-[44ch] text-muted-foreground">
                          {request.rationale}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <div className="font-mono text-muted-foreground">
                          {request.resource}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">
                            {formatScopeLabel(request.scope)}
                          </Badge>
                          <Badge variant={getRiskVariant(request.risk)}>
                            {request.risk} risk
                          </Badge>
                        </div>
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
                      <div className="flex max-w-[28ch] flex-wrap gap-1">
                        {request.privileges.map((privilege) => (
                          <Badge key={privilege} variant="outline">
                            {privilege}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">{request.reviewer}</div>
                      <div className="mt-1 inline-flex items-center gap-1 text-muted-foreground">
                        <HugeiconsIcon icon={Mail01Icon} size={13} />
                        Reviewer notified
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
                            Request more context
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            View entitlement history
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No permission requests match the current filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
          Policy simulation: low-risk `SELECT` requests from approved teams can
          be auto-granted.
        </div>
        <div>Mock queue for UI exploration</div>
      </div>
    </div>
  )
}
