"use client"

import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm } from "@tanstack/react-form"
import { formatDistanceToNowStrict } from "date-fns"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { RequestScope, RequestStatus } from "@/services/permissions"
import {
  cancelPermissionRequestAction,
  getMyPrivilegesAction,
  listPermissionRequestsAction,
  type StoredPermissionRequest,
  submitPermissionRequestAction,
} from "./actions"

const PRIVILEGE_GROUPS = [
  { label: "General", privileges: ["OWNER", "BROWSE"] },
  { label: "Catalog", privileges: ["CREATE_CATALOG", "USE_CATALOG"] },
  { label: "Schema", privileges: ["CREATE_SCHEMA", "USE_SCHEMA"] },
  {
    label: "Table",
    privileges: ["CREATE_TABLE", "SELECT", "MODIFY", "CREATE_EXTERNAL_TABLE"],
  },
  { label: "Function", privileges: ["CREATE_FUNCTION", "EXECUTE"] },
  {
    label: "Volume",
    privileges: ["CREATE_VOLUME", "READ_VOLUME", "CREATE_EXTERNAL_VOLUME"],
  },
  { label: "Files", privileges: ["READ_FILES", "WRITE_FILES"] },
  {
    label: "Storage",
    privileges: [
      "CREATE_EXTERNAL_LOCATION",
      "CREATE_MANAGED_STORAGE",
      "CREATE_STORAGE_CREDENTIAL",
    ],
  },
  { label: "Model", privileges: ["CREATE_MODEL"] },
]

function getStatusVariant(status: RequestStatus) {
  switch (status) {
    case "approved":
      return "success"
    case "ready":
      return "info"
    case "needs-info":
      return "warning"
    case "cancelled":
      return "error"
    default:
      return "default"
  }
}

function formatStatusLabel(status: RequestStatus) {
  switch (status) {
    case "ready":
      return "Grant-ready"
    case "needs-info":
      return "Needs info"
    case "cancelled":
      return "Cancelled"
    default:
      return status[0]?.toUpperCase() + status.slice(1)
  }
}

function formatQueueDecision(
  decision: StoredPermissionRequest["queue_decision"],
) {
  switch (decision) {
    case "auto-approved":
      return "Auto-approved by policy template"
    case "reviewer-gate":
      return "Matched policy template, pending reviewer gate"
    case "security-escalation":
      return "Matched policy template, sent to escalation"
    default:
      return "No matching template, queued for manual review"
  }
}

const CANCELLABLE: RequestStatus[] = ["pending", "ready", "needs-info"]

type Props = {
  resource: string
  scope: RequestScope
}

function parseResource(resource: string, scope: RequestScope) {
  const parts = resource.split(".")
  return {
    catalog: parts[0] ?? resource,
    schema: scope !== "catalog" ? parts[1] : undefined,
    table: scope === "table" ? parts[2] : undefined,
  }
}

export function RequestPermissionsPanel({ resource, scope }: Props) {
  const [history, setHistory] = useState<StoredPermissionRequest[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [grantedPrivileges, setGrantedPrivileges] = useState<Set<string>>(
    new Set(),
  )

  useEffect(() => {
    setLoadingHistory(true)
    const { catalog, schema, table } = parseResource(resource, scope)
    Promise.all([
      listPermissionRequestsAction(resource),
      getMyPrivilegesAction(scope, catalog, schema, table),
    ])
      .then(([requests, privileges]) => {
        setHistory(requests)
        setGrantedPrivileges(new Set(privileges))
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [resource, scope])

  const form = useForm({
    defaultValues: {
      privileges: [] as string[],
      rationale: "",
    },
    validators: {
      onSubmit: ({ value }) => {
        if (value.privileges.length === 0) {
          return { fields: { privileges: "Select at least one privilege." } }
        }
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null)
      const result = await submitPermissionRequestAction({
        resource,
        scope,
        privileges: value.privileges
          .filter((p) => !grantedPrivileges.has(p))
          .sort(),
        rationale: value.rationale.trim(),
      })
      if (result.error) {
        setServerError(result.error)
        return
      }
      if (!result.data) {
        setServerError("Request submission failed.")
        return
      }
      setHistory((prev) => [result.data, ...prev])
      toast.success("Request submitted", {
        description: result.data.policy_template_name
          ? `${result.data.code} - ${formatQueueDecision(result.data.queue_decision)}`
          : `${result.data.code} - Manual review`,
      })
      formApi.reset()
    },
  })

  async function handleCancel(id: string) {
    setCancellingId(id)
    const result = await cancelPermissionRequestAction(id)
    setCancellingId(null)
    if (result.error) {
      toast.error("Failed to cancel", { description: result.error })
      return
    }
    if (!result.data) {
      toast.error("Failed to cancel", { description: "Request not found." })
      return
    }
    setHistory((prev) => prev.map((r) => (r.id === id ? result.data : r)))
    toast.success("Request cancelled")
  }

  return (
    <div className="grid h-full lg:grid-cols-[520px_minmax(0,1fr)] overflow-hidden">
      {/* ── Left: submit form ── */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="flex flex-col gap-5 overflow-y-auto border-r bg-card p-5"
      >
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Privileges
          </Label>
          <form.Field name="privileges">
            {(field) => (
              <>
                {PRIVILEGE_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.privileges.map((priv) => {
                        const granted = grantedPrivileges.has(priv)
                        const checked =
                          granted || field.state.value.includes(priv)
                        return (
                          <button
                            key={priv}
                            type="button"
                            disabled={granted}
                            onClick={() => {
                              field.setValue(
                                checked
                                  ? field.state.value.filter((p) => p !== priv)
                                  : [...field.state.value, priv],
                              )
                            }}
                            className={cn(
                              "flex min-w-0 items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors outline-none",
                              granted
                                ? "cursor-default border-emerald-500/40 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400"
                                : cn(
                                    "cursor-pointer focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                                    checked
                                      ? "border-primary bg-primary/5 text-foreground"
                                      : "border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                                  ),
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                                checked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input bg-background text-transparent dark:bg-input/30",
                              )}
                            >
                              <HugeiconsIcon
                                icon={Tick02Icon}
                                size={12}
                                strokeWidth={2}
                              />
                            </span>
                            <span className="truncate" title={priv}>
                              {priv}
                            </span>
                            {granted && (
                              <span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                Granted
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {field.state.meta.errors.length > 0 && (
                  <p className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <form.Field name="rationale">
          {(field) => (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Rationale / comment
              </Label>
              <Textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Describe why you need this access…"
                className="min-h-20 text-xs"
              />
            </div>
          )}
        </form.Field>

        {serverError && (
          <p className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {serverError}
          </p>
        )}

        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="self-start"
            >
              {isSubmitting ? "Submitting…" : "Submit request"}
            </Button>
          )}
        </form.Subscribe>
      </form>

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
                        {req.code}
                      </span>
                    </div>
                    {CANCELLABLE.includes(req.status) && (
                      <Button
                        type="button"
                        variant="destructive"
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

                  <div className="flex flex-wrap gap-1">
                    {req.policy_template_name ? (
                      <>
                        <Badge variant="outline" className="text-[11px]">
                          {req.policy_template_name}
                        </Badge>
                        {req.policy_template_resource ? (
                          <Badge variant="outline" className="text-[11px]">
                            {req.policy_template_resource}
                          </Badge>
                        ) : null}
                        {req.policy_template_approval_mode ? (
                          <Badge variant="outline" className="text-[11px]">
                            {req.policy_template_approval_mode}
                          </Badge>
                        ) : null}
                      </>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        Manual exception
                      </Badge>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {formatQueueDecision(req.queue_decision)}
                  </p>

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
