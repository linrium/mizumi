"use client"

import {
  IconAlertTriangle,
  IconGitBranch,
  IconPlus,
  IconSearch,
  IconVocabulary,
} from "@tabler/icons-react"
import Link from "next/link"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
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
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  createSemanticDefinition,
  listSemanticDefinitions,
  type SemanticDefinitionSummary,
  type SemanticStatus,
} from "@/services/semantic-registry"

const STATUSES = [
  "all",
  "draft",
  "validated",
  "candidate",
  "certified",
  "active",
  "deprecated",
  "retired",
] as const

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

function definitionHref(item: SemanticDefinitionSummary) {
  const version = item.active_version ?? item.latest_version
  return `/semantic-registry/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}?version=${version}`
}

function parseDependencyLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+)\.([^.@]+)@v?(\d+)$/)
      if (!match) {
        throw new Error(`Invalid dependency reference: ${line}`)
      }
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

function CreateMetricDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [namespace, setNamespace] = useState("finance")
  const [name, setName] = useState("")
  const [version, setVersion] = useState("1")
  const [owner, setOwner] = useState("")
  const [description, setDescription] = useState("")
  const [aggregation, setAggregation] = useState("sum")
  const [timeField, setTimeField] = useState("")
  const [timeGrain, setTimeGrain] = useState("day")
  const [specJson, setSpecJson] = useState(
    '{\n  "expression": "settled_amount - reversal_amount - cashback_amount",\n  "aggregation": "sum",\n  "valid_dimensions": []\n}'
  )
  const [dependencies, setDependencies] = useState("")
  const [physical, setPhysical] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const spec = JSON.parse(specJson)
      const body = {
        namespace,
        name,
        object_type: "metric" as const,
        version: Number(version),
        owner_principal: owner,
        description,
        spec: {
          ...spec,
          aggregation,
          time_field: timeField.trim() || null,
          time_grain: timeGrain,
        },
        time_semantics: timeField.trim()
          ? { field: timeField.trim(), grain: timeGrain }
          : null,
        dependencies: parseDependencyLines(dependencies),
        physical_dependencies: parsePhysicalLines(physical),
      }
      await createSemanticDefinition(body)
      toast.success("Semantic metric created")
      onCreated()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create semantic metric"
      setError(message)
      toast.error("Failed to create semantic metric", { description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New semantic metric</DialogTitle>
          <DialogDescription>
            Create an immutable draft version in the Control Plane registry.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="namespace">Namespace</Label>
              <Input
                id="namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                placeholder="net_spend"
                onChange={(e) => setName(e.target.value)}
              />
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
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="owner">Owner</Label>
            <Input
              id="owner"
              value={owner}
              placeholder="finance-stewards"
              onChange={(e) => setOwner(e.target.value)}
            />
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Aggregation</Label>
              <Select value={aggregation} onValueChange={setAggregation}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">sum</SelectItem>
                  <SelectItem value="count">count</SelectItem>
                  <SelectItem value="avg">avg</SelectItem>
                  <SelectItem value="min">min</SelectItem>
                  <SelectItem value="max">max</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time-field">Time field</Label>
              <Input
                id="time-field"
                value={timeField}
                placeholder="settled_at"
                onChange={(e) => setTimeField(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Time grain</Label>
              <Select value={timeGrain} onValueChange={setTimeGrain}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">day</SelectItem>
                  <SelectItem value="week">week</SelectItem>
                  <SelectItem value="month">month</SelectItem>
                  <SelectItem value="none">none</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="spec">Metric spec JSON</Label>
            <Textarea
              id="spec"
              value={specJson}
              rows={7}
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
              placeholder="finance.settled_amount@v1"
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
              placeholder="hdbank.shared.settled_transaction"
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
            {saving ? "Creating..." : "Create metric"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SemanticRegistryPage() {
  const [definitions, setDefinitions] = useState<SemanticDefinitionSummary[]>(
    []
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all")
  const [dialogOpen, setDialogOpen] = useState(false)

  const loadDefinitions = useCallback(async (cancelled: () => boolean) => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSemanticDefinitions()
      if (!cancelled()) setDefinitions(data)
    } catch (err) {
      if (!cancelled()) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load semantic registry"
        )
      }
    } finally {
      if (!cancelled()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadDefinitions(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [loadDefinitions])

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    return definitions.filter((item) => {
      const matchesStatus = status === "all" || item.latest_status === status
      const matchesQuery =
        !needle ||
        [
          item.namespace,
          item.name,
          item.owner_principal,
          item.description,
          item.latest_status,
        ].some((value) => value.toLowerCase().includes(needle))
      return matchesStatus && matchesQuery
    })
  }, [definitions, deferredQuery, status])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconVocabulary size={16} className="text-muted-foreground" />
              <h1 className="text-sm font-semibold">Semantic Registry</h1>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shared metric definitions, immutable versions, and dependencies.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{definitions.length} definitions</Badge>
            <Button size="default" onClick={() => setDialogOpen(true)}>
              <IconPlus size={14} />
              New metric
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2.5">
          <div className="relative min-w-56 max-w-sm flex-1">
            <IconSearch
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search semantic definitions"
              className="pl-7"
            />
          </div>
          {STATUSES.map((item) => (
            <Button
              key={item}
              variant={status === item ? "secondary" : "ghost"}
              size="default"
              className="shrink-0"
              onClick={() => setStatus(item)}
            >
              {formatStatus(item)}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Dependencies</TableHead>
              <TableHead>Physical refs</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <span className="text-destructive">{error}</span>
                </TableCell>
              </TableRow>
            ) : loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading semantic definitions...
                </TableCell>
              </TableRow>
            ) : filtered.length > 0 ? (
              filtered.map((item) => (
                <TableRow key={`${item.namespace}.${item.name}`}>
                  <TableCell>
                    <Link
                      href={definitionHref(item)}
                      className="font-mono text-sm font-medium hover:underline"
                    >
                      {item.namespace}.{item.name}
                    </Link>
                    <div className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                      {item.description || "No description"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Status variant={statusVariant(item.latest_status)}>
                      <StatusIndicator />
                      <StatusLabel>
                        {formatStatus(item.latest_status)}
                      </StatusLabel>
                    </Status>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.active_version ? (
                        <Badge variant="secondary" className="font-mono">
                          active v{item.active_version}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="font-mono">
                        <IconGitBranch size={11} /> latest v
                        {item.latest_version}
                      </Badge>
                      <Badge variant="outline">
                        {item.version_count} total
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.owner_principal}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {item.semantic_dependency_count} upstream
                    </Badge>
                    <Badge variant="outline" className="ml-1">
                      {item.direct_dependent_count} downstream
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {item.physical_dependency_count} refs
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.updated_at))}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No semantic definitions found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CreateMetricDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          void loadDefinitions(() => false)
        }}
      />
    </div>
  )
}
