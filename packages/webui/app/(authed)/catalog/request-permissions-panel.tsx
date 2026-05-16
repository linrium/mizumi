"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  cancelPermissionRequest,
  createPermissionRequest,
  listPermissionRequests,
  type PermissionRequest,
  type RequestScope,
  type RequestStatus,
} from "@/services/permissions"

type PrivilegeGroup = { label: string; items: string[] }

const SCOPE_PRIVILEGE_GROUPS: Record<RequestScope, PrivilegeGroup[]> = {
  catalog: [
    { label: "Access", items: ["BROWSE", "USE_CATALOG"] },
    { label: "Create", items: ["CREATE_SCHEMA", "CREATE_TABLE", "CREATE_FUNCTION", "CREATE_VOLUME", "CREATE_MODEL"] },
    { label: "Storage", items: ["CREATE_EXTERNAL_LOCATION", "CREATE_MANAGED_STORAGE", "CREATE_STORAGE_CREDENTIAL"] },
  ],
  schema: [
    { label: "Access", items: ["BROWSE", "USE_SCHEMA", "SELECT", "MODIFY"] },
    { label: "Create", items: ["CREATE_TABLE", "CREATE_EXTERNAL_TABLE", "CREATE_FUNCTION", "CREATE_VOLUME"] },
    { label: "Files", items: ["READ_FILES", "WRITE_FILES", "READ_VOLUME"] },
  ],
  table: [
    { label: "Access", items: ["BROWSE", "SELECT", "MODIFY"] },
    { label: "Files", items: ["READ_FILES", "WRITE_FILES", "READ_VOLUME"] },
  ],
}

function getStatusVariant(status: RequestStatus) {
  switch (status) {
    case "approved": return "success"
    case "ready": return "info"
    case "needs-info": return "warning"
    case "cancelled": return "error"
    default: return "default"
  }
}

function formatStatusLabel(status: RequestStatus) {
  switch (status) {
    case "ready": return "Grant-ready"
    case "needs-info": return "Needs info"
    case "cancelled": return "Cancelled"
    default: return status[0]!.toUpperCase() + status.slice(1)
  }
}

const CANCELLABLE: RequestStatus[] = ["pending", "ready", "needs-info"]

type Props = {
  resource: string
  scope: RequestScope
}

export function RequestPermissionsPanel({ resource, scope }: Props) {
  const groups = SCOPE_PRIVILEGE_GROUPS[scope]

  // Form state
  const [requester, setRequester] = useState("")
  const [team, setTeam] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rationale, setRationale] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // History state
  const [history, setHistory] = useState<PermissionRequest[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  function togglePrivilege(p: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const data = await listPermissionRequests({ resource })
      setHistory(data)
    } catch {
      // silently fail for history
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [resource])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!requester.trim()) {
      setFormError("Your name or email is required.")
      return
    }
    if (selected.size === 0) {
      setFormError("Select at least one privilege.")
      return
    }

    setSubmitting(true)
    try {
      const created = await createPermissionRequest({
        requester: requester.trim(),
        team: team.trim() || undefined,
        resource,
        scope,
        privileges: Array.from(selected).sort(),
        rationale: rationale.trim(),
      })
      setHistory((prev) => [created, ...prev])
      setSelected(new Set())
      setRationale("")
      toast.success("Request submitted", { description: created.id })
    } catch (err) {
      const msg = (err as Error).message
      setFormError(msg)
      toast.error("Failed to submit", { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id)
    try {
      const updated = await cancelPermissionRequest(id)
      setHistory((prev) => prev.map((r) => (r.id === id ? updated : r)))
      toast.success("Request cancelled")
    } catch (err) {
      toast.error("Failed to cancel", { description: (err as Error).message })
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="grid h-full lg:grid-cols-[420px_minmax(0,1fr)] overflow-hidden">
      {/* ── Left: submit form ── */}
      <div className="flex flex-col gap-5 overflow-y-auto border-r bg-card p-5">
        <div>
          <h2 className="text-sm font-semibold">Request access</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Submit a permission request for{" "}
            <span className="font-mono">{resource}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Your name / email</Label>
              <Input
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
                placeholder="you@example.com"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Team{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="e.g. Growth Analytics"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Privileges
            </Label>
            {groups.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((priv) => {
                    const checked = selected.has(priv)
                    return (
                      <div
                        key={priv}
                        role="checkbox"
                        tabIndex={0}
                        aria-checked={checked}
                        onClick={() => togglePrivilege(priv)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            togglePrivilege(priv)
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                          checked
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          className="pointer-events-none size-3"
                          aria-hidden
                        />
                        {priv}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Rationale / comment
            </Label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Describe why you need this access…"
              className="min-h-20 text-xs"
            />
          </div>

          {formError && (
            <p className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={submitting}
            className="self-start"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </div>

      {/* ── Right: history ── */}
      <div className="flex flex-col overflow-hidden bg-card">
        <div className="border-b px-5 py-3 shrink-0">
          <h2 className="text-sm font-semibold">Request history</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All requests for this resource
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingHistory ? (
            <p className="px-5 py-4 text-xs text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground">
              No requests yet for this resource.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((req) => (
                <li key={req.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Status variant={getStatusVariant(req.status)}>
                        <StatusIndicator />
                        <StatusLabel className="text-xs">
                          {formatStatusLabel(req.status)}
                        </StatusLabel>
                      </Status>
                      <span className="font-mono text-xs text-muted-foreground">
                        {req.id}
                      </span>
                    </div>
                    {CANCELLABLE.includes(req.status) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={cancellingId === req.id}
                        onClick={() => handleCancel(req.id)}
                        className="h-6 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                      >
                        {cancellingId === req.id ? "Cancelling…" : "Cancel"}
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {req.privileges.map((p) => (
                      <Badge key={p} variant="outline" className="text-[11px]">
                        {p}
                      </Badge>
                    ))}
                  </div>

                  {req.rationale && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {req.rationale}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {req.requester}
                      {req.team ? ` · ${req.team}` : ""}
                    </span>
                    <span>
                      {formatDistanceToNowStrict(new Date(req.submitted_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
