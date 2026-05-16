"use client"

import {
  CheckmarkCircle01Icon,
  Mail01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNowStrict } from "date-fns"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
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
  listPermissionRequests,
  type PermissionRequest,
  type RequestStatus,
  type RiskLevel,
  updateRequestStatus,
} from "@/services/permissions"

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

function formatScopeLabel(scope: string) {
  return scope[0]?.toUpperCase() + scope.slice(1)
}

export default function PermissionsPage() {
  const [requests, setRequests] = useState<PermissionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTERS)[number]["key"]>("all")
  const [approving, setApproving] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [approveTarget, setApproveTarget] = useState<PermissionRequest | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await listPermissionRequests()
        if (!cancelled) {
          setRequests(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load permission requests",
          )
        }
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
  }, [])

  const filteredRequests = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase()

    return requests.filter((request) => {
      const matchesFilter =
        activeFilter === "all" ? true : request.status === activeFilter
      const matchesSearch =
        search.length === 0
          ? true
          : [
              request.code,
              request.requester,
              request.team,
              request.resource,
              request.reviewer,
              request.rationale,
              ...request.privileges,
            ].some((value) => value.toLowerCase().includes(search))

      return matchesFilter && matchesSearch
    })
  }, [requests, activeFilter, deferredQuery])

  const stats = useMemo(() => {
    const pending = requests.filter((item) => item.status === "pending")
    const ready = requests.filter((item) => item.status === "ready")
    const expiringSoon = requests.filter((item) => item.expires_in_days <= 3)
    const highRisk = requests.filter((item) => item.risk === "high")

    return {
      pending: pending.length,
      ready: ready.length,
      expiringSoon: expiringSoon.length,
      highRisk: highRisk.length,
    }
  }, [requests])

  async function handleApprove() {
    if (!approveTarget || approving) return
    setApproving(true)
    setError(null)
    try {
      const updated = await updateRequestStatus(approveTarget.id, "approved")
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      )
      setApproveTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve request")
    } finally {
      setApproving(false)
    }
  }

  async function handleDropdownAction(
    id: string,
    action: "approve" | "needs-info",
  ) {
    const status: RequestStatus =
      action === "approve" ? "approved" : "needs-info"
    setActiveRequestId(id)
    setError(null)
    try {
      const updated = await updateRequestStatus(id, status)
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update request")
    } finally {
      setActiveRequestId(null)
    }
  }

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: requests.length }
    for (const r of requests) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
    }
    return counts
  }, [requests])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Permission requests</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Review access grants, temporary exceptions, and renewals.
            </p>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div />
        </div>

        <div className="flex items-center justify-between gap-4 overflow-x-auto border-t px-3">
          <div className="flex items-center -mb-px">
            {FILTERS.map((filter) => {
              const count = filterCounts[filter.key] ?? 0
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                    activeFilter === filter.key
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                  <span
                    className={cn(
                      "tabular-nums",
                      activeFilter === filter.key
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="my-1.5 h-7 w-48 min-w-0 shrink text-xs"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Request</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Privileges</TableHead>
              <TableHead>Reviewer</TableHead>
              {/*<TableHead>SLA</TableHead>*/}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : filteredRequests.length > 0 ? (
              filteredRequests.map((request) => {
                const submittedLabel = formatDistanceToNowStrict(
                  new Date(request.submitted_at),
                  { addSuffix: true },
                )
                const isActioning = activeRequestId === request.id

                return (
                  <TableRow
                    key={request.id}
                    className={cn(
                      request.risk === "high" && "bg-destructive/5",
                      request.expires_in_days <= 2 &&
                        "border-l-2 border-l-primary",
                    )}
                  >
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {request.requester}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {request.code}
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
                    </TableCell>
                    {/*<TableCell className="align-top">*/}
                    {/*  <div className="font-medium">*/}
                    {/*    {request.expires_in_days <= 0*/}
                    {/*      ? "Expired"*/}
                    {/*      : `${request.expires_in_days} day${*/}
                    {/*          request.expires_in_days === 1 ? "" : "s"*/}
                    {/*        }`}*/}
                    {/*  </div>*/}
                    {/*  <div className="text-muted-foreground">*/}
                    {/*    {request.expires_in_days <= 2*/}
                    {/*      ? "Escalate today"*/}
                    {/*      : "Within policy window"}*/}
                    {/*  </div>*/}
                    {/*</TableCell>*/}
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
                          <DropdownMenuItem
                            disabled={
                              isActioning || request.status === "approved"
                            }
                            onClick={() => setApproveTarget(request)}
                          >
                            {isActioning && request.status !== "approved"
                              ? "Approving…"
                              : "Approve request"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isActioning}
                            onClick={() =>
                              handleDropdownAction(request.id, "needs-info")
                            }
                          >
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
                  colSpan={7}
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
          Policy simulation: low-risk SELECT requests from approved teams can be
          auto-granted.
        </div>
        <div className="flex items-center gap-3">
          {stats.expiringSoon > 0 && (
            <span>{stats.expiringSoon} expiring soon</span>
          )}
          {stats.highRisk > 0 && <span>{stats.highRisk} high risk</span>}
          <span>{requests.length} total</span>
        </div>
      </div>

      <Dialog
        open={approveTarget != null}
        onOpenChange={(open) => {
          if (!open && !approving) {
            setApproveTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve permission request?</DialogTitle>
            <DialogDescription>
              {approveTarget
                ? `${approveTarget.requester} will be granted ${approveTarget.privileges.join(", ")} on ${approveTarget.resource}.`
                : "Confirm this permission grant."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={approving}
              onClick={() => setApproveTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={approving} onClick={handleApprove}>
              {approving ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
