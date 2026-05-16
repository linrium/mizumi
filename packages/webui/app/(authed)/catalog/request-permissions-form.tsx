"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DatabaseIcon,
  SecurityIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { CatalogApiError, type PermissionsResponse } from "@/services/catalog-types"
import { getPermissionsAction, patchPermissionsAction } from "./actions"

const PRIVILEGES = [
  "OWNER",
  "BROWSE",
  "CREATE_CATALOG",
  "USE_CATALOG",
  "CREATE_SCHEMA",
  "USE_SCHEMA",
  "CREATE_TABLE",
  "SELECT",
  "MODIFY",
  "CREATE_FUNCTION",
  "EXECUTE",
  "CREATE_VOLUME",
  "READ_VOLUME",
  "CREATE_MODEL",
  "CREATE_EXTERNAL_LOCATION",
  "READ_FILES",
  "WRITE_FILES",
  "CREATE_EXTERNAL_TABLE",
  "CREATE_EXTERNAL_VOLUME",
  "CREATE_MANAGED_STORAGE",
  "CREATE_STORAGE_CREDENTIAL",
] as const

type Privilege = (typeof PRIVILEGES)[number]

const PRIVILEGE_GROUPS: ReadonlyArray<{
  label: string
  privileges: readonly Privilege[]
}> = [
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

type CatalogRequestPermissionsFormProps = {
  catalog: string
  currentPrincipal: string
}

function normalizeAssignments(data: PermissionsResponse | null) {
  return data?.privilege_assignments ?? []
}

export function CatalogRequestPermissionsForm({
  catalog,
  currentPrincipal,
}: CatalogRequestPermissionsFormProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [existingPrivileges, setExistingPrivileges] = useState<Set<string>>(
    new Set(),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)
    setForbidden(false)
    setSelected(new Set())

    getPermissionsAction("catalog", catalog)
      .then((data: PermissionsResponse) => {
        if (cancelled) {
          return
        }

        const assignments = normalizeAssignments(data)
        const currentAssignment = assignments.find(
          (assignment) =>
            assignment.principal.toLowerCase() === currentPrincipal.toLowerCase(),
        )

        setExistingPrivileges(new Set(currentAssignment?.privileges ?? []))
      })
      .catch((nextError: Error) => {
        if (cancelled) {
          return
        }

        if (nextError instanceof CatalogApiError && nextError.status === 403) {
          setForbidden(true)
          setExistingPrivileges(new Set())
          return
        }

        setError(nextError.message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [catalog, currentPrincipal])

  const requestableGroups = useMemo(
    () =>
      PRIVILEGE_GROUPS.map((group) => ({
        ...group,
        privileges: group.privileges.filter(
          (privilege) => !existingPrivileges.has(privilege),
        ),
      })).filter((group) => group.privileges.length > 0),
    [existingPrivileges],
  )

  const existingList = useMemo(
    () => Array.from(existingPrivileges).sort(),
    [existingPrivileges],
  )

  const selectedList = useMemo(() => Array.from(selected).sort(), [selected])

  function togglePrivilege(privilege: Privilege, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(privilege)
      } else {
        next.delete(privilege)
      }
      return next
    })
  }

  async function submitRequest() {
    if (!currentPrincipal) {
      setError("Unable to determine the signed-in principal.")
      return
    }

    if (selectedList.length === 0) {
      toast.info("Select at least one privilege to request")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const data = await patchPermissionsAction({
        resourceType: "catalog",
        catalog,
        principal: currentPrincipal,
        add: selectedList,
        remove: [],
      })

      const assignments = normalizeAssignments(data)
      const currentAssignment = assignments.find(
        (assignment) =>
          assignment.principal.toLowerCase() === currentPrincipal.toLowerCase(),
      )

      setExistingPrivileges(new Set(currentAssignment?.privileges ?? []))
      setSelected(new Set())
      toast.success("Permission request submitted")
    } catch (nextError) {
      const message = (nextError as Error).message
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(72,101,255,0.04)_0%,rgba(72,101,255,0)_28%),radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_30%)]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="space-y-4">
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="border-emerald-900/10 bg-emerald-50 text-emerald-900/80"
            >
              Self-service access request
            </Badge>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Request access to {catalog}
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Choose only the catalog privileges you do not already have.
                Existing access is shown below, and only missing privileges can
                be requested from this page.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/35 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Requesting as
              </p>
              <p className="mt-1 break-all font-mono text-xs">
                {currentPrincipal || "Unknown principal"}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md bg-background/80 px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={DatabaseIcon}
                  size={15}
                  className="text-muted-foreground"
                />
                <h3 className="text-sm font-semibold">Current access</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Privileges already granted to your principal on this catalog.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : existingList.length > 0 ? (
                  existingList.map((privilege) => (
                    <Badge key={privilege} variant="secondary">
                      {privilege}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No catalog privileges found for this principal.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md bg-background/80 px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={SecurityIcon}
                  size={15}
                  className="text-muted-foreground"
                />
                <h3 className="text-sm font-semibold">Request summary</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Selected privileges will be added to your principal only.
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-muted/20 px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Selected
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedList.length > 0 ? (
                      selectedList.map((privilege) => (
                        <Badge key={privilege}>{privilege}</Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No privileges selected yet.
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={submitRequest}
                  disabled={
                    loading ||
                    forbidden ||
                    saving ||
                    selectedList.length === 0 ||
                    !currentPrincipal
                  }
                >
                  {saving ? "Submitting…" : "Request selected privileges"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {error && (
            <div className="rounded-2xl bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {forbidden && (
            <div className="rounded-2xl bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              You do not have permission to inspect catalog privileges for this
              resource, so the page cannot determine which privileges are
              missing.
            </div>
          )}

          {!forbidden && (
            <section className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Requestable privileges</h3>
                <p className="text-sm text-muted-foreground">
                  The list below excludes anything already granted to{" "}
                  <span className="font-mono text-foreground">
                    {currentPrincipal || "your principal"}
                  </span>
                  .
                </p>
              </div>

              {loading ? (
                <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
              ) : requestableGroups.length === 0 ? (
                <div className="mt-5 rounded-2xl bg-emerald-50/60 px-4 py-4 text-sm text-emerald-950/80">
                  Everything in this catalog privilege set is already assigned
                  to your principal. There is nothing left to request here.
                </div>
              ) : (
                <div className="grid gap-3">
                  {requestableGroups.map((group) => (
                    <div
                      key={group.label}
                      className="rounded-md border border-border bg-background/80 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            {group.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {group.privileges.length} available to request
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {group.privileges.map((privilege) => {
                          const checked = selected.has(privilege)

                          return (
                            <button
                              key={privilege}
                              type="button"
                              aria-pressed={checked}
                              onClick={() => togglePrivilege(privilege, !checked)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                  return
                                }
                                event.preventDefault()
                                togglePrivilege(privilege, !checked)
                              }}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                                checked
                                  ? "bg-primary/6"
                                  : "hover:bg-accent/40",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                className="pointer-events-none"
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <Label className="cursor-pointer text-sm">
                                  {privilege}
                                </Label>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      </div>
    </div>
  )
}
