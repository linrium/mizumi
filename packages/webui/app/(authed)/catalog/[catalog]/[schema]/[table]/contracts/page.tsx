"use client"

import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconFileCertificate,
  IconRefresh,
  IconRocket,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react"
import Editor from "@monaco-editor/react"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Status,
  StatusIndicator,
  StatusLabel,
} from "@/components/ui/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  activateTableContractAction,
  getTableContractAction,
  getTableContractYamlAction,
  importTableContractAction,
  validateTableContractAction,
} from "../../../../actions"

type ContractDetail = {
  definition: {
    namespace: string
    name: string
    version: number
    status: string
    owner_principal: string
    description: string
    spec: {
      id?: string
      apiVersion?: string
      schema?: Array<{
        properties?: Array<unknown>
      }>
    }
    updated_at: string
  }
  physical_dependencies: Array<{
    catalog: string
    schema_name: string
    object_name: string
    object_type: string
  }>
  validation: {
    valid: boolean
    checked_at: string
    checks: Array<{
      result: string
      check: string
      field?: string
      details?: string
    }>
  }
}

function statusVariant(status: string) {
  if (status === "active" || status === "certified") return "success"
  if (status === "deprecated" || status === "retired") return "warning"
  if (status === "draft") return "default"
  return "info"
}

export default function TableContractsPage() {
  const { catalog, schema, table } = useParams<{
    catalog: string
    schema: string
    table: string
  }>()
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [yaml, setYaml] = useState<string>("")
  const [yamlLoading, setYamlLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fullPath = `${catalog}.${schema}.${table}`
  const propertyCount = useMemo(
    () => contract?.definition.spec.schema?.[0]?.properties?.length ?? 0,
    [contract]
  )

  function load() {
    setLoading(true)
    setError(null)
    setYaml("")
    getTableContractAction(catalog, schema, table)
      .then((value: unknown) => setContract(value as ContractDetail | null))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [catalog, schema, table])

  useEffect(() => {
    if (!contract) {
      setYaml("")
      return
    }

    let cancelled = false
    setYamlLoading(true)
    getTableContractYamlAction(
      catalog,
      schema,
      table,
      contract.definition.version
    )
      .then((value) => {
        if (!cancelled) setYaml(value)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setYaml("")
          toast.error("YAML preview failed", { description: e.message })
        }
      })
      .finally(() => {
        if (!cancelled) setYamlLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [catalog, schema, table, contract?.definition.version])

  function runImport() {
    startTransition(async () => {
      try {
        await importTableContractAction(catalog, schema, table)
        toast.success("Data contract synced")
        load()
      } catch (e) {
        toast.error("Sync failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        })
      }
    })
  }

  function runValidate() {
    if (!contract) return
    startTransition(async () => {
      try {
        const validation = await validateTableContractAction(
          catalog,
          schema,
          table,
          contract.definition.version
        )
        setContract({ ...contract, validation: validation as ContractDetail["validation"] })
        toast.success("Validation complete")
      } catch (e) {
        toast.error("Validation failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        })
      }
    })
  }

  function runActivate() {
    if (!contract) return
    startTransition(async () => {
      try {
        const next = await activateTableContractAction(
          catalog,
          schema,
          table,
          contract.definition.version
        )
        setContract(next as ContractDetail)
        toast.success("Contract activated")
      } catch (e) {
        toast.error("Activation failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        })
      }
    })
  }

  function downloadYaml() {
    if (!contract) return
    startTransition(async () => {
      try {
        const contractYaml =
          yaml ||
          (await getTableContractYamlAction(
            catalog,
            schema,
            table,
            contract.definition.version
          ))
        const url = URL.createObjectURL(
          new Blob([contractYaml], { type: "application/yaml" })
        )
        const link = document.createElement("a")
        link.href = url
        link.download = `${table}-odcs-v${contract.definition.version}.yaml`
        link.click()
        URL.revokeObjectURL(url)
      } catch (e) {
        toast.error("YAML export failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        })
      }
    })
  }

  function copyYaml() {
    if (!yaml) return
    navigator.clipboard.writeText(yaml)
    toast.success("YAML copied")
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading contract…
      </div>
    )
  }

  if (error) {
    return <div className="p-5 text-sm text-destructive font-mono">{error}</div>
  }

  if (!contract) {
    return (
      <div className="flex-1 overflow-auto p-5">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2">
            <IconFileCertificate size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">No data contract</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground font-mono">
            {fullPath}
          </p>
        </div>
        <div className="py-5">
          <Button onClick={runImport} disabled={isPending}>
            <IconRefresh />
            Sync from Unity Catalog
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-4 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconFileCertificate size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">Data contract</h2>
              <Status
                variant={statusVariant(contract.definition.status)}
                className="py-0.5"
              >
                <StatusIndicator />
                <StatusLabel>{contract.definition.status}</StatusLabel>
              </Status>
              <Badge variant={contract.validation.valid ? "secondary" : "destructive"}>
                {contract.validation.valid ? "valid" : "invalid"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
              {contract.definition.namespace}.{contract.definition.name}@v
              {contract.definition.version}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runImport} disabled={isPending}>
              <IconRefresh />
              Sync
            </Button>
            <Button variant="outline" onClick={runValidate} disabled={isPending}>
              <IconShieldCheck />
              Validate
            </Button>
            <Button onClick={runActivate} disabled={isPending}>
              <IconRocket />
              Activate
            </Button>
            <Button variant="ghost" onClick={downloadYaml} disabled={isPending}>
              <IconExternalLink />
              Download YAML
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b bg-border md:grid-cols-4">
        {[
          ["ODCS", contract.definition.spec.apiVersion ?? "v3.1.0"],
          ["Owner", contract.definition.owner_principal],
          ["Fields", String(propertyCount)],
          ["Updated", new Date(contract.definition.updated_at).toLocaleString()],
        ].map(([label, value]) => (
          <div key={label} className="bg-background px-5 py-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="mt-1 truncate text-xs">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-b">
        <h3 className="text-xs font-semibold mb-2">Physical dependency</h3>
        <div className="flex flex-wrap gap-2">
          {contract.physical_dependencies.map((dep) => (
            <Badge
              key={`${dep.catalog}.${dep.schema_name}.${dep.object_name}`}
              variant="outline"
              className="font-mono"
            >
              {dep.catalog}.{dep.schema_name}.{dep.object_name}
            </Badge>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Result</TableHead>
            <TableHead>Check</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contract.validation.checks.map((check, index) => (
            <TableRow key={`${check.check}-${check.field ?? index}`}>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  {check.result === "passed" ? (
                    <IconCheck size={13} className="text-green-600" />
                  ) : (
                    <IconX size={13} className="text-destructive" />
                  )}
                  {check.result}
                </span>
              </TableCell>
              <TableCell>{check.check}</TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {check.field ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {check.details ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="border-t px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold">ODCS YAML</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Read-only contract document generated from Unity Catalog metadata.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!contract) return
                setYamlLoading(true)
                getTableContractYamlAction(
                  catalog,
                  schema,
                  table,
                  contract.definition.version
                )
                  .then(setYaml)
                  .catch((e: Error) =>
                    toast.error("YAML refresh failed", {
                      description: e.message,
                    })
                  )
                  .finally(() => setYamlLoading(false))
              }}
              disabled={yamlLoading || isPending}
            >
              <IconRefresh />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyYaml}
              disabled={!yaml || yamlLoading}
            >
              <IconCopy />
              Copy
            </Button>
          </div>
        </div>
        <div className="h-[420px] overflow-hidden rounded-md border bg-background">
          <Editor
            height="100%"
            language="yaml"
            theme="vs"
            value={yamlLoading ? "Loading YAML..." : yaml}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              overviewRulerLanes: 0,
              renderLineHighlight: "line",
              padding: { top: 12, bottom: 12 },
              fontFamily: "var(--font-geist-mono)",
              lineHeight: 1.6,
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  )
}
