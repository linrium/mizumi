"use client"

import { ArrowDown01Icon, UserIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const DEFAULT_PRINCIPALS = [
  "linh@gmail.com",
  "khaosoi@gmail.com",
  "khaopad@gmail.com",
  "rikki@gmail.com",
] as const

const PRIVILEGES = [
  "OWNER",
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

type PermissionAssignment = {
  principal: string
  privileges?: string[]
}

type PermissionsResponse = {
  privilege_assignments?: PermissionAssignment[]
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

type PermissionsEditorProps = {
  resourceType: ResourceType
  catalog: string
  schema?: string
  table?: string
  title: string
  subtitle: string
}

async function fetchPermissions(
  resourceType: ResourceType,
  catalog: string,
  schema?: string,
  table?: string,
): Promise<PermissionsResponse> {
  const res = await fetch(
    `/api/catalog?${new URLSearchParams({
      type: "permissions",
      resourceType,
      catalog,
      ...(schema ? { schema } : {}),
      ...(table ? { table } : {}),
    })}`,
  )
  const json = await res.json()
  if (!res.ok)
    throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json as PermissionsResponse
}

async function patchPermissions(
  resourceType: ResourceType,
  catalog: string,
  schema: string | undefined,
  table: string | undefined,
  principal: string,
  add: string[],
  remove: string[],
) {
  const res = await fetch(
    `/api/catalog?${new URLSearchParams({
      type: "permissions",
      resourceType,
      catalog,
      ...(schema ? { schema } : {}),
      ...(table ? { table } : {}),
    })}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        changes: [{ principal, add, remove }],
      }),
    },
  )
  const json = await res.json()
  if (!res.ok)
    throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json as PermissionsResponse
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
  title,
  subtitle,
}: PermissionsEditorProps) {
  const [assignments, setAssignments] = useState<PermissionAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [principalOpen, setPrincipalOpen] = useState(false)
  const [principal, setPrincipal] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setForbidden(false)

    fetchPermissions(resourceType, catalog, schema, table)
      .then((data) => {
        if (cancelled) return
        setAssignments(normalizePrivileges(data.privilege_assignments))
      })
      .catch((e: Error) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 403) {
          setForbidden(true)
          setAssignments([])
          setPrincipal("")
          setSelected(new Set())
        }
        setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
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

  const principalOptions = useMemo(() => {
    const deduped = new Map<string, string>()

    for (const email of DEFAULT_PRINCIPALS) {
      deduped.set(email.toLowerCase(), email)
    }

    for (const assignment of assignments) {
      deduped.set(assignment.principal.toLowerCase(), assignment.principal)
    }

    return Array.from(deduped.values())
  }, [assignments])

  function loadAssignment(next: PermissionAssignment) {
    setPrincipal(next.principal)
    setSelected(new Set(next.privileges ?? []))
    setPrincipalOpen(false)
  }

  function resetEditor() {
    setPrincipal("")
    setSelected(new Set())
    setPrincipalOpen(false)
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
    if (forbidden) return
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
      const data = await patchPermissions(
        resourceType,
        catalog,
        schema,
        table,
        nextPrincipal,
        add,
        remove,
      )
      const nextAssignments = normalizePrivileges(data.privilege_assignments)
      setAssignments(nextAssignments)

      const refreshed = nextAssignments.find(
        (assignment) =>
          assignment.principal.toLowerCase() === nextPrincipal.toLowerCase(),
      ) ?? {
        principal: nextPrincipal,
        privileges: Array.from(selected).sort(),
      }

      setPrincipal(refreshed.principal)
      setSelected(new Set(refreshed.privileges ?? []))
      toast.success("Permissions updated")
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true)
        setAssignments([])
        setPrincipal("")
        setSelected(new Set())
      }
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function revokeAll() {
    if (forbidden) return
    const nextPrincipal = principal.trim()
    if (!nextPrincipal || originalPrivileges.size === 0) return

    setSaving(true)
    setError(null)
    try {
      const data = await patchPermissions(
        resourceType,
        catalog,
        schema,
        table,
        nextPrincipal,
        [],
        Array.from(originalPrivileges),
      )
      setAssignments(normalizePrivileges(data.privilege_assignments))
      setSelected(new Set())
      toast.success("Permissions revoked")
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true)
        setAssignments([])
        setPrincipal("")
        setSelected(new Set())
      }
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!loading && forbidden) {
    return (
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[320px] shrink-0 border-r overflow-y-auto">
          <div className="flex min-h-[56px] items-center border-b px-5 py-2.5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Current assignments
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Access denied
              </p>
            </div>
          </div>

          <p className="px-5 py-4 text-xs text-muted-foreground">
            You do not have access to view permission assignments for this{" "}
            {resourceType}.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex min-h-[56px] items-center justify-between gap-3 border-b px-5 py-2.5">
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {subtitle}
              </p>
            </div>
            <Button variant="ghost" onClick={resetEditor} disabled>
              Clear
            </Button>
          </div>

          <div className="px-5 py-4">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium">Permission denied</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This page is unavailable because the permissions endpoint
                returned 403 for this {resourceType}.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive font-mono whitespace-pre-wrap">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="w-[320px] shrink-0 border-r overflow-y-auto">
        <div className="flex min-h-[56px] items-center border-b px-5 py-2.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Current assignments
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {assignments.length} principal
              {assignments.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {loading && (
          <p className="px-5 py-4 text-xs text-muted-foreground">
            Loading permissions…
          </p>
        )}

        {!loading && !forbidden && assignments.length === 0 && (
          <p className="px-5 py-4 text-xs text-muted-foreground">
            No explicit permissions found for this {resourceType}.
          </p>
        )}

        {!loading && assignments.length > 0 && (
          <div className="p-2">
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
                    "w-full rounded-lg border px-3 py-3 text-left transition-colors hover:bg-accent/30",
                    isActive
                      ? "border-foreground/20 bg-accent/40"
                      : "border-transparent",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-medium">
                      {assignment.principal}
                    </p>
                    <Badge variant="outline">
                      {(assignment.privileges ?? []).length}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(assignment.privileges ?? [])
                      .slice(0, 4)
                      .map((privilege) => (
                        <Badge
                          key={privilege}
                          variant="outline"
                          className="font-mono"
                        >
                          {privilege}
                        </Badge>
                      ))}
                    {(assignment.privileges ?? []).length > 4 && (
                      <Badge variant="outline">
                        +{(assignment.privileges ?? []).length - 4}
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-[56px] items-center justify-between gap-3 border-b px-5 py-2.5">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              {subtitle}
            </p>
          </div>
          <Button variant="ghost" onClick={resetEditor} disabled={saving}>
            Clear
          </Button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="principal">Principal</Label>
            <Popover open={principalOpen} onOpenChange={setPrincipalOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="principal"
                  variant="outline"
                  role="combobox"
                  aria-expanded={principalOpen}
                  className="w-full justify-between text-left font-normal"
                  disabled={saving}
                >
                  <span
                    className={cn(
                      "truncate",
                      !principal && "text-muted-foreground",
                    )}
                  >
                    {principal || "Choose or type a principal"}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    data-icon="inline-end"
                    className="opacity-50"
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] p-0"
              >
                <Command shouldFilter>
                  <CommandInput
                    value={principal}
                    onValueChange={setPrincipal}
                    placeholder="Search or type a principal"
                  />
                  <CommandList>
                    <CommandEmpty>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs/relaxed"
                        onClick={() => setPrincipalOpen(false)}
                      >
                        <HugeiconsIcon
                          icon={UserIcon}
                          className="text-muted-foreground"
                        />
                        <span className="truncate">
                          Use <span className="font-mono">{principal}</span>
                        </span>
                      </button>
                    </CommandEmpty>
                    <CommandGroup heading="Suggested principals">
                      {principalOptions.map((option) => (
                        <CommandItem
                          key={option}
                          value={option}
                          data-checked={
                            principal.trim().toLowerCase() ===
                            option.toLowerCase()
                          }
                          onSelect={(value) => {
                            setPrincipal(value)
                            setPrincipalOpen(false)
                          }}
                        >
                          <HugeiconsIcon
                            icon={UserIcon}
                            className="text-muted-foreground"
                          />
                          <span className="truncate font-mono">{option}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Choose an existing principal from the left or type a new one.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {PRIVILEGES.map((privilege) => {
              const checked = selected.has(privilege)
              return (
                <div
                  key={privilege}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    checked
                      ? "border-primary/30 bg-primary/5"
                      : "border-border hover:bg-accent/20",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      togglePrivilege(privilege, value === true)
                    }
                    disabled={saving}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium font-mono">{privilege}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Pending changes
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {add.map((privilege) => (
                <Badge key={`add-${privilege}`} className="font-mono">
                  + {privilege}
                </Badge>
              ))}
              {remove.map((privilege) => (
                <Badge
                  key={`remove-${privilege}`}
                  variant="destructive"
                  className="font-mono"
                >
                  - {privilege}
                </Badge>
              ))}
              {add.length === 0 && remove.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No changes queued.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={saveChanges}
              disabled={saving || !principal.trim()}
            >
              {saving ? "Saving…" : "Save permissions"}
            </Button>
            <Button
              variant="destructive"
              onClick={revokeAll}
              disabled={
                saving || !principal.trim() || originalPrivileges.size === 0
              }
            >
              Revoke all
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
