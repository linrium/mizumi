"use client"

import {
  IconAlertTriangle,
  IconArrowLeft,
  IconGitBranch,
  IconGitCompare,
  IconPlus,
} from "@tabler/icons-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { Textarea } from "@/components/ui/textarea"
import {
  createSemanticVersion,
  getSemanticDefinition,
  listSemanticVersions,
  type SemanticDefinition,
  type SemanticDefinitionDetail,
  type SemanticStatus,
  transitionSemanticStatus,
} from "@/services/semantic-registry"

const NEXT_STATUS: Partial<Record<SemanticStatus, SemanticStatus[]>> = {
  draft: ["validated", "retired"],
  validated: ["candidate"],
  candidate: ["certified"],
  certified: ["active"],
  active: ["deprecated"],
  deprecated: ["retired"],
}

function statusVariant(status: SemanticStatus) {
  switch (status) {
    case "active":
    case "certified":
      return "success"
    case "candidate":
    case "validated":
      return "info"
    case "deprecated":
      return "warning"
    case "retired":
      return "error"
    default:
      return "default"
  }
}

function formatStatus(status: string) {
  return status[0]?.toUpperCase() + status.slice(1)
}

function semanticLabel(item: SemanticDefinition) {
  return `${item.namespace}.${item.name}@v${item.version}`
}

function parseDependencyLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+)\.([^.@]+)@v?(\d+)$/)
      if (!match) throw new Error(`Invalid dependency reference: ${line}`)
      return {
        namespace: match[1],
        name: match[2],
        version: Number(match[3]),
        dependency_type: "semantic",
      }
    })
}

function parsePhysicalLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(".")
      if (parts.length < 3) {
        throw new Error(`Invalid Unity Catalog reference: ${line}`)
      }
      const [catalog, schemaName, ...objectParts] = parts
      return {
        catalog,
        schema_name: schemaName,
        object_name: objectParts.join("."),
        object_type: "table",
        contract_version: null,
      }
    })
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function NewVersionDialog({
  open,
  onOpenChange,
  current,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: SemanticDefinitionDetail
  onCreated: (version: number) => void
}) {
  const base = current.definition
  const [version, setVersion] = useState(String(base.version + 1))
  const [owner, setOwner] = useState(base.owner_principal)
  const [description, setDescription] = useState(base.description)
  const [specJson, setSpecJson] = useState(JSON.stringify(base.spec, null, 2))
  const [dependencies, setDependencies] = useState(
    current.dependencies.map(semanticLabel).join("\n"),
  )
  const [physical, setPhysical] = useState(
    current.physical_dependencies
      .map((item) => `${item.catalog}.${item.schema_name}.${item.object_name}`)
      .join("\n"),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setVersion(String(base.version + 1))
    setOwner(base.owner_principal)
    setDescription(base.description)
    setSpecJson(JSON.stringify(base.spec, null, 2))
    setDependencies(current.dependencies.map(semanticLabel).join("\n"))
    setPhysical(
      current.physical_dependencies
        .map(
          (item) => `${item.catalog}.${item.schema_name}.${item.object_name}`,
        )
        .join("\n"),
    )
  }, [base, current.dependencies, current.physical_dependencies])

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const spec = JSON.parse(specJson)
      await createSemanticVersion(base.namespace, base.name, {
        namespace: base.namespace,
        name: base.name,
        object_type: "metric",
        version: Number(version),
        owner_principal: owner,
        description,
        spec,
        time_semantics: base.time_semantics,
        supersedes_version: base.version,
        dependencies: parseDependencyLines(dependencies),
        physical_dependencies: parsePhysicalLines(physical),
      })
      toast.success("Semantic version created")
      onCreated(Number(version))
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create semantic version"
      setError(message)
      toast.error("Failed to create semantic version", { description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New version</DialogTitle>
          <DialogDescription>
            Create a draft version that supersedes v{base.version}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Semantic name</Label>
              <Input value={`${base.namespace}.${base.name}`} disabled />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={version}
                inputMode="numeric"
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="spec">Metric spec JSON</Label>
            <Textarea
              id="spec"
              value={specJson}
              rows={8}
              className="font-mono text-xs"
              onChange={(e) => setSpecJson(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dependencies">Semantic dependencies</Label>
            <Textarea
              id="dependencies"
              value={dependencies}
              rows={3}
              className="font-mono text-xs"
              onChange={(e) => setDependencies(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Each line must reference an existing definition, for
              example finance.net_spend@v1.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="physical">Physical dependencies</Label>
            <Textarea
              id="physical"
              value={physical}
              rows={3}
              className="font-mono text-xs"
              onChange={(e) => setPhysical(e.target.value)}
            />
          </div>
          {error ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <IconAlertTriangle size={13} />
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating..." : "Create version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SemanticDefinitionDetailPage() {
  const params = useParams<{ namespace: string; name: string }>()
  const router = useRouter()
  const namespace = decodeURIComponent(params.namespace)
  const name = decodeURIComponent(params.name)
  const [versions, setVersions] = useState<SemanticDefinition[]>([])
  const [detail, setDetail] = useState<SemanticDefinitionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioning, setActioning] = useState<SemanticStatus | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [versionParam, setVersionParam] = useState(() => {
    if (typeof window === "undefined") return 0
    return Number(
      new URLSearchParams(window.location.search).get("version") ?? 0,
    )
  })
  const selectedVersion =
    versionParam > 0 ? versionParam : (versions[0]?.version ?? 1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const loadedVersions = await listSemanticVersions(namespace, name)
        const version =
          versionParam > 0 ? versionParam : (loadedVersions[0]?.version ?? 1)
        const loadedDetail = await getSemanticDefinition(
          namespace,
          name,
          version,
        )
        if (!cancelled) {
          setVersions(loadedVersions)
          setDetail(loadedDetail)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load semantic definition",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [namespace, name, versionParam])

  const nextStatuses = useMemo(
    () => (detail ? (NEXT_STATUS[detail.definition.status] ?? []) : []),
    [detail],
  )

  async function transition(status: SemanticStatus) {
    if (!detail) return
    setActioning(status)
    try {
      const updated = await transitionSemanticStatus(
        namespace,
        name,
        detail.definition.version,
        status,
        `Transitioned to ${status} from Semantic Registry UI`,
      )
      setDetail(updated)
      const loadedVersions = await listSemanticVersions(namespace, name)
      setVersions(loadedVersions)
      toast.success(`Status changed to ${status}`)
    } catch (err) {
      toast.error("Failed to transition status", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setActioning(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading semantic definition...
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-4">
        <Button variant="ghost" asChild>
          <Link href="/semantic-registry">
            <IconArrowLeft size={14} />
            Semantic Registry
          </Link>
        </Button>
        <p className="mt-4 text-sm text-destructive">
          {error ?? "Semantic definition not found"}
        </p>
      </div>
    )
  }

  const definition = detail.definition

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <Button variant="ghost" size="default" asChild>
            <Link href="/semantic-registry">
              <IconArrowLeft size={14} />
              Registry
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-sm font-semibold">
                {definition.namespace}.{definition.name}
              </h1>
              <Status variant={statusVariant(definition.status)}>
                <StatusIndicator />
                <StatusLabel>{formatStatus(definition.status)}</StatusLabel>
              </Status>
              <Badge variant="outline" className="font-mono">
                <IconGitBranch size={11} />v{definition.version}
              </Badge>
            </div>
            <p className="mt-0.5 max-w-3xl truncate text-xs text-muted-foreground">
              {definition.description || "No description"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={String(selectedVersion)}
              onValueChange={(value) => {
                setVersionParam(Number(value))
                router.push(
                  `/semantic-registry/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}?version=${value}`,
                )
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={String(version.version)}>
                    v{version.version} {version.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" asChild>
              <Link
                href={`/semantic-registry/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/compare?from=${Math.max(1, definition.version - 1)}&to=${definition.version}`}
              >
                <IconGitCompare size={14} />
                Compare
              </Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <IconPlus size={14} />
              New version
            </Button>
          </div>
        </div>
        {nextStatuses.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2.5">
            <span className="text-xs text-muted-foreground">Lifecycle</span>
            {nextStatuses.map((status) => (
              <Button
                key={status}
                variant="outline"
                size="default"
                disabled={actioning === status}
                onClick={() => transition(status)}
              >
                {actioning === status ? "Updating..." : `Mark ${status}`}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Definition</h2>
              <div className="mt-2">
                <JsonBlock value={definition.spec} />
              </div>
            </div>

            {definition.time_semantics ? (
              <div>
                <h2 className="text-sm font-semibold">Time semantics</h2>
                <div className="mt-2">
                  <JsonBlock value={definition.time_semantics} />
                </div>
              </div>
            ) : null}

            <div>
              <h2 className="text-sm font-semibold">Physical dependencies</h2>
              <div className="mt-2 divide-y rounded-md border">
                {detail.physical_dependencies.length > 0 ? (
                  detail.physical_dependencies.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="font-mono">
                        {item.catalog}.{item.schema_name}.{item.object_name}
                      </span>
                      <Badge variant="outline">{item.object_type}</Badge>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No physical references
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold">Semantic dependencies</h2>
                <div className="mt-2 divide-y rounded-md border">
                  {detail.dependencies.length > 0 ? (
                    detail.dependencies.map((item) => (
                      <Link
                        key={item.id}
                        href={`/semantic-registry/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}?version=${item.version}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <span className="font-mono">{semanticLabel(item)}</span>
                        <Badge variant="outline">{item.status}</Badge>
                      </Link>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No semantic dependencies
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold">Direct dependents</h2>
                <div className="mt-2 divide-y rounded-md border">
                  {detail.dependents.length > 0 ? (
                    detail.dependents.map((item) => (
                      <Link
                        key={item.id}
                        href={`/semantic-registry/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}?version=${item.version}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <span className="font-mono">{semanticLabel(item)}</span>
                        <Badge variant="outline">{item.status}</Badge>
                      </Link>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No direct dependents
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-md border p-3">
              <h2 className="text-sm font-semibold">Metadata</h2>
              <Separator className="my-3" />
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="truncate font-mono">
                    {definition.owner_principal}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Created by</dt>
                  <dd className="truncate font-mono">
                    {definition.created_by}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(definition.created_at))}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-md border p-3">
              <h2 className="text-sm font-semibold">Lifecycle history</h2>
              <Separator className="my-3" />
              <div className="space-y-3">
                {detail.lifecycle_history.length > 0 ? (
                  detail.lifecycle_history.map((event) => (
                    <div key={event.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline">{event.new_status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(event.created_at))}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {event.previous_status ?? "created"} →{" "}
                        {event.new_status} by {event.principal}
                      </div>
                      {event.reason ? (
                        <div className="mt-1 text-xs">{event.reason}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No lifecycle events recorded
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <NewVersionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        current={detail}
        onCreated={(version) =>
          router.push(
            `/semantic-registry/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}?version=${version}`,
          )
        }
      />
    </div>
  )
}
