"use client"

import { IconCheck } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

const PRINCIPAL_NAME_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
})

const HARDCODED_PRINCIPALS = [
  "rikki@gmail.com",
  "linh@gmail.com",
  "khaosoi@gmail.com",
  "khaopad@gmail.com",
] as const

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

interface PermissionsEditorProps {
  catalog: string
  resourceType: ResourceType
  schema?: string
  table?: string
}

function normalizePrivileges(
  assignments: PermissionAssignment[] | undefined
): PermissionAssignment[] {
  const normalizedAssignments = (assignments ?? []).map((assignment) => ({
    principal: assignment.principal,
    privileges: Array.from(new Set(assignment.privileges ?? [])).sort(),
  }))
  const assignmentsByPrincipal = new Map(
    normalizedAssignments.map((assignment) => [
      assignment.principal.toLowerCase(),
      assignment,
    ])
  )

  for (const principal of HARDCODED_PRINCIPALS) {
    if (!assignmentsByPrincipal.has(principal.toLowerCase())) {
      normalizedAssignments.push({
        principal,
        privileges: [],
      })
    }
  }

  return normalizedAssignments.sort((left, right) =>
    PRINCIPAL_NAME_COLLATOR.compare(left.principal, right.principal)
  )
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
          assignment.principal.toLowerCase() === principal.trim().toLowerCase()
      ),
    [assignments, principal]
  )

  const originalPrivileges = useMemo(
    () => new Set(currentAssignment?.privileges ?? []),
    [currentAssignment]
  )

  const add = useMemo(
    () =>
      Array.from(selected).filter(
        (privilege) => !originalPrivileges.has(privilege)
      ),
    [selected, originalPrivileges]
  )

  const remove = useMemo(
    () =>
      Array.from(originalPrivileges).filter(
        (privilege) => !selected.has(privilege)
      ),
    [selected, originalPrivileges]
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
        add,
        catalog,
        principal: nextPrincipal,
        remove,
        resourceType,
        schema,
        table,
      })
      const nextAssignments = normalizePrivileges(data.privilege_assignments)
      setAssignments(nextAssignments)

      const refreshed = nextAssignments.find(
        (assignment) =>
          assignment.principal.toLowerCase() === nextPrincipal.toLowerCase()
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

  function renderAssignments() {
    if (loading) {
      return <p className="text-muted-foreground text-sm">Loading…</p>
    }
    if (assignments.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          No principals with permissions found.
        </p>
      )
    }
    return (
      <div className="space-y-1.5">
        {assignments.map((assignment) => {
          const isActive =
            assignment.principal.toLowerCase() ===
            principal.trim().toLowerCase()

          return (
            <button
              className={cn(
                "w-full rounded border px-2.5 py-2 text-left transition-colors",
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/40"
              )}
              key={assignment.principal}
              onClick={() => loadAssignment(assignment)}
              type="button"
            >
              <p className="truncate font-medium text-xs">
                {assignment.principal}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(assignment.privileges ?? []).length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    No privileges assigned.
                  </span>
                ) : (
                  assignment.privileges?.map((privilege) => (
                    <Badge
                      className="text-[11px]"
                      key={privilege}
                      variant="secondary"
                    >
                      {privilege}
                    </Badge>
                  ))
                )}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full flex-col">
      <div className="grid h-full lg:grid-cols-[350px_minmax(0,1fr)]">
        <div className="h-full space-y-4 border-r bg-card p-4">
          <div className="space-y-2">
            <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Principals
            </Label>
            {renderAssignments()}
          </div>
        </div>

        <div className="space-y-4 bg-card p-4">
          <div className="space-y-1">
            <h2 className="font-semibold text-sm">Privileges</h2>
            <p className="text-muted-foreground text-sm">
              Select the privileges to assign to the chosen principal.
            </p>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Editing principal
              </Label>
              {currentAssignment ? (
                <p className="text-sm">{currentAssignment.principal}</p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Select a principal to edit permissions.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={resetEditor} size="sm" variant="outline">
                Reset
              </Button>
              <Button
                disabled={saving || loading}
                onClick={saveChanges}
                size="sm"
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {forbidden ? (
            <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-amber-700 text-sm">
              You do not have permission to edit this resource.
            </p>
          ) : null}

          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <div className="space-y-4">
              {PRIVILEGE_GROUPS.map((group) => (
                <div className="space-y-2" key={group.label}>
                  <p className="font-medium text-[11px] text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.privileges.map((privilege) => {
                      const checked = selected.has(privilege)
                      return (
                        <button
                          className={cn(
                            "flex min-w-0 cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                            checked
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                          )}
                          key={privilege}
                          onClick={() => togglePrivilege(privilege, !checked)}
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input bg-background text-transparent dark:bg-input/30"
                            )}
                          >
                            <IconCheck size={12} stroke={2} />
                          </span>
                          <span className="truncate" title={privilege}>
                            {privilege}
                          </span>
                        </button>
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
