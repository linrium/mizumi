"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  CatalogApiError,
  type PermissionAssignment,
  type PermissionsResponse,
} from "@/services/catalog-types"
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
type ResourceType = "catalog" | "schema" | "table"

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

type PermissionsEditorProps = {
  resourceType: ResourceType
  catalog: string
  schema?: string
  table?: string
}

function normalizePrivileges(
  assignments: PermissionAssignment[] | undefined,
): PermissionAssignment[] {
  return (assignments ?? []).map((assignment) => ({
    principal: assignment.principal,
    privileges: Array.from(new Set(assignment.privileges ?? [])).sort(),
  }))
}

export function PermissionsEditor({
  resourceType,
  catalog,
  schema,
  table,
}: PermissionsEditorProps) {
  const [assignments, setAssignments] = useState<PermissionAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [principal, setPrincipal] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setForbidden(false)

    getPermissionsAction(resourceType, catalog, schema, table)
      .then((data: PermissionsResponse) => {
        if (cancelled) {
          return
        }
        setAssignments(normalizePrivileges(data.privilege_assignments))
      })
      .catch((e: Error) => {
        if (cancelled) {
          return
        }
        if (e instanceof CatalogApiError && e.status === 403) {
          setForbidden(true)
          setAssignments([])
          setPrincipal("")
          setSelected(new Set())
        }
        setError(e.message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [resourceType, catalog, schema, table])

  const currentAssignment = useMemo(
    () =>
      assignments.find(
        (assignment) =>
          assignment.principal.toLowerCase() === principal.trim().toLowerCase(),
      ),
    [assignments, principal],
  )

  const originalPrivileges = useMemo(
    () => new Set(currentAssignment?.privileges ?? []),
    [currentAssignment],
  )

  const add = useMemo(
    () =>
      Array.from(selected).filter(
        (privilege) => !originalPrivileges.has(privilege),
      ),
    [selected, originalPrivileges],
  )

  const remove = useMemo(
    () =>
      Array.from(originalPrivileges).filter(
        (privilege) => !selected.has(privilege),
      ),
    [selected, originalPrivileges],
  )

  function loadAssignment(next: PermissionAssignment) {
    setPrincipal(next.principal)
    setSelected(new Set(next.privileges ?? []))
  }

  function resetEditor() {
    setPrincipal("")
    setSelected(new Set())
  }

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

  async function saveChanges() {
    if (forbidden) {
      return
    }

    const nextPrincipal = principal.trim()
    if (!nextPrincipal) {
      setError("Principal is required")
      return
    }
    if (add.length === 0 && remove.length === 0) {
      toast.info("No permission changes to save")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const data = await patchPermissionsAction({
        resourceType,
        catalog,
        schema,
        table,
        principal: nextPrincipal,
        add,
        remove,
      })
      const nextAssignments = normalizePrivileges(data.privilege_assignments)
      setAssignments(nextAssignments)

      const refreshed = nextAssignments.find(
        (assignment) =>
          assignment.principal.toLowerCase() === nextPrincipal.toLowerCase(),
      ) ?? {
        principal: nextPrincipal,
        privileges: [],
      }

      loadAssignment(refreshed)
      toast.success("Permissions updated")
    } catch (e) {
      setError((e as Error).message)
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full h-full flex-col">
      <div className="grid h-full lg:grid-cols-[350px_minmax(0,1fr)]">
        <div className="space-y-4 h-full border-r bg-card p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={resetEditor}>
              Reset
            </Button>
            <Button
              size="sm"
              onClick={saveChanges}
              disabled={saving || loading}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Principals
            </Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No principals with permissions found.
              </p>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const isActive =
                    assignment.principal.toLowerCase() ===
                    principal.trim().toLowerCase()

                  return (
                    <button
                      key={assignment.principal}
                      type="button"
                      onClick={() => loadAssignment(assignment)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/40",
                      )}
                    >
                      <p className="truncate text-sm font-medium">
                        {assignment.principal}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(assignment.privileges ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            No privileges assigned.
                          </span>
                        ) : (
                          assignment.privileges?.map((privilege) => (
                            <Badge key={privilege} variant="secondary">
                              {privilege}
                            </Badge>
                          ))
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {currentAssignment && (
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Editing principal
              </Label>
              <p className="text-sm">{currentAssignment.principal}</p>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {forbidden && (
            <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-700">
              You do not have permission to edit this resource.
            </p>
          )}
        </div>

        <div className="space-y-4 bg-card p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Privileges</h2>
            <p className="text-sm text-muted-foreground">
              Select the privileges to assign to the chosen principal.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-4">
              {PRIVILEGE_GROUPS.map((group) => (
                <div key={group.label} className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.privileges.map((privilege) => {
                      const checked = selected.has(privilege)
                      return (
                        <div
                          key={privilege}
                          className={cn(
                            "flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                            checked
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-accent/40",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              togglePrivilege(privilege, value === true)
                            }
                          />
                          <span>{privilege}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
