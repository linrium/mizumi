"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { MoreHorizontal, RefreshCw, ShieldOff } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  adminRenewGrant,
  listTimeBoundGrants,
  revokeGrant,
  type TimeBoundGrant,
} from "@/services/permissions"

type GrantStatus = TimeBoundGrant["renewal_status"]
type DialogMode = "revoke" | "renew"

function getRenewalVariant(status: GrantStatus) {
  switch (status) {
    case "healthy":
      return "success"
    case "expiring":
      return "warning"
    case "revoked":
      return "default"
    default:
      return "error"
  }
}

function formatRenewalLabel(status: GrantStatus) {
  switch (status) {
    case "healthy":
      return "Healthy"
    case "expiring":
      return "Expiring"
    case "revoked":
      return "Revoked"
    default:
      return "Expired"
  }
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "healthy", label: "Healthy" },
  { value: "expiring", label: "Expiring" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
]

// Shared summary block used in both modals
function GrantSummary({ grant }: { grant: TimeBoundGrant }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs space-y-1.5">
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Principal</span>
        <span className="font-medium text-right">{grant.principal}</span>
      </div>
      {grant.team && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Team</span>
          <span className="text-right">{grant.team}</span>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Resource</span>
        <span className="font-mono text-right break-all">{grant.resource}</span>
      </div>
      {grant.scope && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Scope</span>
          <Badge variant="outline" className="text-[10px]">
            {grant.scope}
          </Badge>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Privilege</span>
        <span>{grant.privilege}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Expires</span>
        <span>
          {formatDistanceToNowStrict(new Date(grant.expires_at), {
            addSuffix: true,
          })}
        </span>
      </div>
    </div>
  )
}

export default function TimeBoundAccessPage() {
  const [grants, setGrants] = useState<TimeBoundGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [resourceFilter, setResourceFilter] = useState("")
  const [principalFilter, setPrincipalFilter] = useState("")

  // Dialog state
  const [dialogGrant, setDialogGrant] = useState<TimeBoundGrant | null>(null)
  const [dialogMode, setDialogMode] = useState<DialogMode>("revoke")
  const [renewDays, setRenewDays] = useState("30")
  const [submitting, setSubmitting] = useState(false)

  function openDialog(grant: TimeBoundGrant, mode: DialogMode) {
    setDialogGrant(grant)
    setDialogMode(mode)
    setRenewDays("30")
  }

  function closeDialog() {
    if (submitting) return
    setDialogGrant(null)
  }

  function fetchGrants() {
    setLoading(true)
    listTimeBoundGrants({
      status: statusFilter !== "all" ? statusFilter : undefined,
      resource: resourceFilter || undefined,
      principal: principalFilter || undefined,
    })
      .then(setGrants)
      .catch(() => toast.error("Failed to load grants"))
      .finally(() => setLoading(false))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional filter deps
  useEffect(() => {
    fetchGrants()
  }, [statusFilter, resourceFilter, principalFilter])

  async function handleConfirmRevoke() {
    if (!dialogGrant) return
    const grant = dialogGrant
    setSubmitting(true)
    try {
      const updated = await revokeGrant(grant.id)
      setGrants((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
      toast.success("Grant revoked", {
        description: `${grant.principal} — ${grant.privilege} on ${grant.resource}`,
      })
      setDialogGrant(null)
    } catch (err) {
      toast.error("Failed to revoke grant", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmRenew() {
    if (!dialogGrant) return
    const grant = dialogGrant
    const days = parseInt(renewDays, 10)
    if (!days || days < 1) {
      toast.error("Enter a valid number of days (≥ 1)")
      return
    }
    const newExpiry = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000,
    ).toISOString()
    setSubmitting(true)
    try {
      const updated = await adminRenewGrant(grant.id, newExpiry)
      setGrants((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
      toast.success("Grant renewed", {
        description: `Expires in ${days} day${days === 1 ? "" : "s"}`,
      })
      setDialogGrant(null)
    } catch (err) {
      toast.error("Failed to renew grant", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const expiringToday = grants.filter((g) => {
    const diff = new Date(g.expires_at).getTime() - Date.now()
    return diff >= 0 && diff < 86_400_000
  }).length

  const expired = grants.filter((g) => g.renewal_status === "expired").length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b shrink-0 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold">Time-bound access</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Temporary grants, renewals, and expirations that need attention.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {expiringToday > 0 &&
              `${expiringToday} grant${expiringToday === 1 ? "" : "s"} expire${expiringToday === 1 ? "s" : ""} today`}
            {expiringToday > 0 && expired > 0 && " and "}
            {expired > 0 && `${expired} have already lapsed`}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-2 flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            placeholder="Filter by resource…"
            className="h-7 w-56 text-xs"
          />

          <Input
            value={principalFilter}
            onChange={(e) => setPrincipalFilter(e.target.value)}
            placeholder="Filter by principal…"
            className="h-7 w-52 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Principal</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Privilege</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-10" />
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
            ) : grants.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No grants match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              grants.map((grant) => {
                const isActive =
                  grant.renewal_status === "healthy" ||
                  grant.renewal_status === "expiring"
                const isExpiring = grant.renewal_status === "expiring"
                return (
                  <TableRow key={grant.id}>
                    <TableCell className="align-top">
                      <div className="space-y-0.5">
                        <div className="font-medium">{grant.principal}</div>
                        <div className="text-xs text-muted-foreground">
                          {grant.team}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-mono text-xs text-muted-foreground break-all">
                        {grant.resource}
                      </div>
                      {grant.scope && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {grant.scope}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{grant.privilege}</TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      <div>
                        Started{" "}
                        {formatDistanceToNowStrict(new Date(grant.started_at), {
                          addSuffix: true,
                        })}
                      </div>
                      <div>
                        Expires{" "}
                        {formatDistanceToNowStrict(new Date(grant.expires_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Status variant={getRenewalVariant(grant.renewal_status)}>
                        <StatusIndicator />
                        <StatusLabel>
                          {formatRenewalLabel(grant.renewal_status)}
                        </StatusLabel>
                      </Status>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {grant.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      {isActive && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            {isExpiring && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => openDialog(grant, "renew")}
                                >
                                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                                  Renew
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => openDialog(grant, "revoke")}
                            >
                              <ShieldOff className="mr-2 h-3.5 w-3.5" />
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={dialogGrant !== null && dialogMode === "revoke"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke grant</DialogTitle>
            <DialogDescription>
              This will immediately remove access from the Unity Catalog. The
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {dialogGrant && <GrantSummary grant={dialogGrant} />}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRevoke}
              disabled={submitting}
            >
              {submitting ? "Revoking…" : "Revoke grant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew dialog */}
      <Dialog
        open={dialogGrant !== null && dialogMode === "renew"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew grant</DialogTitle>
            <DialogDescription>
              Extend the expiry of this grant by the specified number of days
              from now.
            </DialogDescription>
          </DialogHeader>
          {dialogGrant && <GrantSummary grant={dialogGrant} />}
          <div className="space-y-1.5">
            <Label htmlFor="renew-days" className="text-xs">
              Extension (days)
            </Label>
            <Input
              id="renew-days"
              type="number"
              min={1}
              max={365}
              value={renewDays}
              onChange={(e) => setRenewDays(e.target.value)}
              className="h-8 text-sm"
              placeholder="e.g. 30"
            />
            {Number(renewDays) >= 1 && (
              <p className="text-xs text-muted-foreground">
                New expiry:{" "}
                {new Date(
                  Date.now() + Number(renewDays) * 86_400_000,
                ).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmRenew} disabled={submitting}>
              {submitting ? "Renewing…" : "Confirm renewal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
