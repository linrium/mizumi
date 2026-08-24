"use client"

import Editor from "@monaco-editor/react"
import {
  IconActivity,
  IconAlertTriangle,
  IconCalendarClock,
  IconClock,
  IconCopy,
  IconExternalLink,
  IconFileCertificate,
  IconRefresh,
  IconRocket,
  IconShieldCheck,
} from "@tabler/icons-react"
import Link from "next/link"
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
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import {
  activateTableContractAction,
  getLatestTableContractQualityResultAction,
  getTableContractAction,
  getTableContractRuntimeStatusAction,
  getTableContractYamlAction,
  importTableContractAction,
  runTableContractQualityChecksAction,
  validateTableContractAction,
} from "../../../../actions"

type SlaProperty = {
  id?: string
  property?: string
  value?: unknown
  valueExt?: unknown
  unit?: string
  element?: string
  driver?: string
  description?: string
  scheduler?: string
  schedule?: string
}

type StreamingJob = {
  id: string
  name: string
  main_application_file: string
}

type SlaActionTarget = {
  href: string
  label: string
}

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
      slaProperties?: SlaProperty[]
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

type ContractRuntimeStatus = {
  checked_at: string
  status: "ok" | "warning" | "unknown" | string
  warnings: string[]
  checks: Array<{
    check: string
    status: "ok" | "warning" | "unknown" | string
    message: string
  }>
  dagster: {
    asset_key?: string
    schedule_name?: string
    schedule_status?: string
    cron_schedule?: string
    last_tick_status?: string
    last_tick_timestamp?: number
    latest_run_status?: string
    latest_run_id?: string
    latest_materialization_timestamp?: string
    latest_materialization_run_id?: string
    in_progress_run_ids: string[]
    unstarted_run_ids: string[]
  }
}

interface ContractQualityStatus {
  run_id?: string
  saved_at?: string
  checked_at: string
  status: "passed" | "failed" | "error" | "unknown" | string
  warnings: string[]
  checks: Array<{
    id: string
    description: string
    field?: string | null
    status: "passed" | "failed" | "error" | string
    message: string
    failed_rows?: number | null
    total_rows?: number | null
    query: string
  }>
}

const DAGSTER_DAILY_SCHEDULE = "cross_sell_daily_schedule"

const DAGSTER_ASSET_BY_TABLE: Record<string, string> = {
  "hdbank.hdbank_partnership_prod_bronze.customers_v1": "hdbank_bronze_customers",
  "hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1":
    "hdbank_gold_vietjet_activation_candidates",
  "hdbank.hdbank_partnership_prod_silver.customers_v1": "hdbank_silver_customers",
  "hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1":
    "hdbank_silver_travel_spend_features",
  "partnership.co_brand_gold.campaign_summary_v1": "partnership_gold_campaign_summary",
  "partnership.co_brand_gold.co_brand_offer_audience_v1":
    "partnership_gold_co_brand_offer_audience",
  "partnership.co_brand_silver.customer_360_v1": "partnership_silver_customer_360",
  "vietjetair.vietjetair_partnership_prod_bronze.customers_v1":
    "vietjetair_bronze_customers",
  "vietjetair.vietjetair_partnership_prod_gold.baggage_damage_classifications_v1":
    "vietjetair_gold_baggage_damage_classifications",
  "vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1":
    "vietjetair_gold_hdbank_finance_candidates",
  "vietjetair.vietjetair_partnership_prod_silver.booking_features_v1":
    "vietjetair_silver_booking_features",
  "vietjetair.vietjetair_partnership_prod_silver.customers_v1":
    "vietjetair_silver_customers",
}

function statusVariant(status: string) {
  if (status === "active" || status === "certified") return "success"
  if (status === "deprecated" || status === "retired") return "warning"
  if (status === "draft") return "default"
  return "info"
}

function qualityStatusClass(status: string) {
  return status === "passed"
    ? "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
    : "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
}

function formatSlaValue(sla: SlaProperty) {
  const value = valueToString(sla.value)
  const valueExt = valueToString(sla.valueExt)
  const unit = sla.unit ? ` ${sla.unit}` : ""
  return [value ? `${value}${unit}` : "—", valueExt].filter(Boolean).join(" / ")
}

function valueToString(value: unknown) {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function qualityRuleCount(contract: ContractDetail | null) {
  const schemaObjects = contract?.definition.spec.schema ?? []
  return schemaObjects.reduce((count, object) => {
    const objectQuality = Array.isArray((object as { quality?: unknown }).quality)
      ? ((object as { quality?: unknown[] }).quality?.length ?? 0)
      : 0
    const properties = Array.isArray(object.properties)
      ? (object.properties as Array<{ quality?: unknown }>)
      : []
    const propertyQuality = properties.reduce<number>((sum, property) => {
      const { quality } = property
      return sum + (Array.isArray(quality) ? quality.length : 0)
    }, 0)
    return count + objectQuality + propertyQuality
  }, 0)
}

function labelForSlaProperty(property?: string) {
  if (!property) return "SLA"
  return property
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase())
}

function defaultSlaProperties(schema: string, table: string): SlaProperty[] {
  const schemaName = schema.toLowerCase()
  const tableName = table.toLowerCase()
  const isStreaming =
    schemaName.includes("bronze") &&
    ["transactions", "tickets", "incidents", "events"].some((token) =>
      tableName.includes(token)
    )

  const properties: SlaProperty[] = isStreaming
    ? [
        {
          description:
            "Streaming bronze data should be queryable within 15 minutes of source arrival.",
          driver: "operational",
          element: table,
          id: "stream_latency_15_minutes",
          property: "latency",
          unit: "minutes",
          value: "15",
        },
        {
          description:
            "Spark Structured Streaming jobs should keep the target table continuously available.",
          driver: "operational",
          element: table,
          id: "stream_availability",
          property: "availability",
          unit: "percent",
          value: "99.5",
        },
      ]
    : [
        {
          description:
            "Dagster cross_sell_daily_schedule refreshes this contract's batch asset daily.",
          driver: "analytics",
          element: table,
          id: "daily_frequency",
          property: "frequency",
          schedule: "0 2 * * *",
          scheduler: "dagster",
          unit: "d",
          value: "1",
        },
        {
          description:
            "Daily batch outputs should be available after the scheduled Spark materialization window.",
          driver: "analytics",
          element: table,
          id: "daily_time_of_availability",
          property: "timeOfAvailability",
          schedule: "0 2 * * *",
          scheduler: "dagster",
          value: "03:00+00:00",
        },
      ]

  return [
    ...properties,
    {
      description: "Mizumi retains this dataset indefinitely.",
      driver: "operational",
      element: table,
      id: "default_retention",
      property: "retention",
      value: "forever",
    },
  ]
}

function isStreamingTable(schema: string, table: string) {
  const schemaName = schema.toLowerCase()
  const tableName = table.toLowerCase()
  return (
    schemaName.includes("bronze") &&
    ["transactions", "tickets", "incidents", "events"].some((token) =>
      tableName.includes(token)
    )
  )
}

function isDagsterSla(sla: SlaProperty) {
  return sla.scheduler?.toLowerCase() === "dagster"
}

function slaPropertyKey(sla: SlaProperty) {
  return sla.property?.toLowerCase() ?? ""
}

function maxAgeHoursForFrequencySla(sla: SlaProperty | undefined) {
  if (!sla) return undefined
  const value =
    typeof sla.value === "number"
      ? sla.value
      : Number.parseFloat(String(sla.value ?? ""))
  if (!Number.isFinite(value) || value <= 0) return undefined

  const unit = sla.unit?.toLowerCase()
  const hours =
    unit === "d" || unit === "day" || unit === "days"
      ? value * 24
      : unit === "h" || unit === "hour" || unit === "hours"
        ? value
        : unit === "m" || unit === "minute" || unit === "minutes"
          ? value / 60
          : undefined

  // Allow a small execution window beyond the declared cadence.
  return hours == null ? undefined : hours + 2
}

function availabilityTimeForSla(sla: SlaProperty | undefined) {
  const value = valueToString(sla?.value)
  return /^\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value) ? value : undefined
}

function formatDagsterTimestamp(timestamp?: string) {
  if (!timestamp) return "unknown"
  const epoch = Number.parseFloat(timestamp)
  const date = Number.isFinite(epoch)
    ? new Date(epoch > 100_000_000_000 ? epoch : epoch * 1000)
    : new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
}

function slaActionTargets(
  sla: SlaProperty,
  catalog: string,
  schema: string,
  table: string,
  streamingJobs: StreamingJob[]
): SlaActionTarget[] {
  if (isDagsterSla(sla)) {
    const scheduleHref = `/pipelines/schedules/${encodeURIComponent(DAGSTER_DAILY_SCHEDULE)}`
    const assetKey = dagsterAssetForTable(catalog, schema, table)
    const targets = [
      {
        href: scheduleHref,
        label: `Dagster schedule: ${DAGSTER_DAILY_SCHEDULE}`,
      },
    ]

    if (assetKey) {
      targets.unshift({
        href: `/pipelines/assets/${encodeURIComponent(assetKey)}`,
        label: `Dagster asset: ${assetKey}`,
      })
    }

    return targets
  }

  if (!isStreamingTable(schema, table)) {
    return []
  }

  const job = findStreamingJobForTable(streamingJobs, table)
  return [
    {
      href: job ? `/pipelines/streaming/${encodeURIComponent(job.id)}` : "/pipelines/streaming",
      label: job ? `Spark stream: ${job.name}` : "Spark streams",
    },
  ]
}

function dagsterAssetForTable(catalog: string, schema: string, table: string) {
  return DAGSTER_ASSET_BY_TABLE[`${catalog}.${schema}.${table}`]
}

function findStreamingJobForTable(streamingJobs: StreamingJob[], table: string) {
  const tableKey = normalizeLookupKey(table.replace(/_v\d+$/i, ""))
  return streamingJobs.find((job) => {
    const nameKey = normalizeLookupKey(job.name)
    const fileKey = normalizeLookupKey(job.main_application_file)
    return nameKey.includes(tableKey) || fileKey.includes(tableKey)
  })
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function slaElementTargets(
  element: string | undefined,
  catalog: string,
  schema: string,
  table: string
) {
  return (element ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label) => ({
      href: catalogPathForElement(label, catalog, schema, table),
      label,
    }))
}

function catalogPathForElement(
  element: string,
  catalog: string,
  schema: string,
  table: string
) {
  const parts = element.split(".").filter(Boolean)
  const encode = encodeURIComponent

  if (parts.length >= 4) {
    return `/catalog/${encode(parts[0])}/${encode(parts[1])}/${encode(parts[2])}`
  }

  if (parts.length === 3) {
    if (parts[0] === catalog) {
      return `/catalog/${encode(parts[0])}/${encode(parts[1])}/${encode(parts[2])}`
    }

    return `/catalog/${encode(catalog)}/${encode(parts[0])}/${encode(parts[1])}`
  }

  if (parts.length === 2) {
    if (parts[0] === table) {
      return `/catalog/${encode(catalog)}/${encode(schema)}/${encode(table)}`
    }

    return `/catalog/${encode(catalog)}/${encode(schema)}/${encode(parts[0])}`
  }

  return `/catalog/${encode(catalog)}/${encode(schema)}/${encode(parts[0] || table)}`
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
  const [streamingJobs, setStreamingJobs] = useState<StreamingJob[]>([])
  const [runtimeStatus, setRuntimeStatus] =
    useState<ContractRuntimeStatus | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [qualityStatus, setQualityStatus] =
    useState<ContractQualityStatus | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  const fullPath = `${catalog}.${schema}.${table}`
  const propertyCount = useMemo(
    () => contract?.definition.spec.schema?.[0]?.properties?.length ?? 0,
    [contract]
  )
  const qualityCount = useMemo(() => qualityRuleCount(contract), [contract])
  const storedSlaProperties = useMemo(
    () => contract?.definition.spec.slaProperties ?? [],
    [contract]
  )
  const slaProperties = useMemo(
    () =>
      storedSlaProperties.length > 0
        ? storedSlaProperties
        : defaultSlaProperties(schema, table),
    [schema, storedSlaProperties, table]
  )
  const hasStoredSlaProperties = storedSlaProperties.length > 0
  const dagsterSla = slaProperties.find(isDagsterSla)
  const frequencySla = slaProperties.find(
    (sla) => isDagsterSla(sla) && slaPropertyKey(sla) === "frequency"
  )
  const availabilitySla = slaProperties.find(
    (sla) => isDagsterSla(sla) && slaPropertyKey(sla) === "timeofavailability"
  )

  function load() {
    setLoading(true)
    setError(null)
    setYaml("")
    setQualityStatus(null)
    getTableContractAction(catalog, schema, table)
      .then((value: unknown) => setContract(value as ContractDetail | null))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [catalog, schema, table])

  useEffect(() => {
    let cancelled = false
    fetchWithAuth("/api/streaming/jobs", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (!cancelled) setStreamingJobs(body.jobs ?? [])
      })
      .catch(() => {
        if (!cancelled) setStreamingJobs([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!contract || !dagsterSla) {
      setRuntimeStatus(null)
      setRuntimeLoading(false)
      return
    }

    const assetKey = dagsterAssetForTable(catalog, schema, table)
    const maxAgeHours = maxAgeHoursForFrequencySla(frequencySla)
    const availabilityTime = availabilityTimeForSla(availabilitySla)
    if (!assetKey && !dagsterSla) {
      setRuntimeStatus(null)
      return
    }

    let cancelled = false
    setRuntimeLoading(true)
    getTableContractRuntimeStatusAction(
      catalog,
      schema,
      table,
      contract.definition.version,
      {
        assetKey,
        scheduleName: DAGSTER_DAILY_SCHEDULE,
        maxAgeHours,
        availabilityTime,
      }
    )
      .then((value) => {
        if (!cancelled) setRuntimeStatus(value as ContractRuntimeStatus)
      })
      .catch(() => {
        if (!cancelled) setRuntimeStatus(null)
      })
      .finally(() => {
        if (!cancelled) setRuntimeLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    availabilitySla,
    catalog,
    contract,
    dagsterSla,
    frequencySla,
    schema,
    table,
  ])

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

  useEffect(() => {
    if (!contract) {
      setQualityStatus(null)
      return
    }

    let cancelled = false
    getLatestTableContractQualityResultAction(
      catalog,
      schema,
      table,
      contract.definition.version
    )
      .then((value) => {
        if (!cancelled) setQualityStatus(value as ContractQualityStatus | null)
      })
      .catch(() => {
        if (!cancelled) setQualityStatus(null)
      })

    return () => {
      cancelled = true
    }
  }, [catalog, schema, table, contract?.definition.version])

  function runImport() {
    startTransition(async () => {
      try {
        const next = await importTableContractAction(catalog, schema, table)
        setContract(next as ContractDetail)
        toast.success("Data contract synced")
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

  function runQualityChecks() {
    if (!contract) return
    setQualityLoading(true)
    runTableContractQualityChecksAction(
      catalog,
      schema,
      table,
      contract.definition.version
    )
      .then((value) => {
        const result = value as ContractQualityStatus
        setQualityStatus(result)
        if (result.status === "passed") {
          toast.success("Quality checks passed")
        } else {
          toast.warning("Quality checks completed", {
            description: `${result.checks.filter((check) => check.status !== "passed").length} checks need attention.`,
          })
        }
      })
      .catch((e: Error) => {
        setQualityStatus(null)
        toast.error("Quality checks failed", { description: e.message })
      })
      .finally(() => setQualityLoading(false))
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

      <div className="grid grid-cols-2 gap-px border-b bg-border md:grid-cols-5">
        {[
          ["ODCS", contract.definition.spec.apiVersion ?? "v3.1.0"],
          ["Owner", contract.definition.owner_principal],
          ["Fields", String(propertyCount)],
          ["Quality", String(qualityCount)],
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

      <div className="border-b px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconShieldCheck size={15} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold">Data quality</h3>
            <Badge variant="outline">{qualityCount} checks</Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runQualityChecks}
            disabled={qualityLoading || isPending || qualityCount === 0}
          >
            <IconActivity />
            {qualityLoading ? "Running..." : "Run checks"}
          </Button>
        </div>
        {qualityCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            No executable quality checks are defined in this contract.
          </p>
        ) : qualityStatus ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-medium">
                Saved{" "}
                {new Date(
                  qualityStatus.saved_at ?? qualityStatus.checked_at
                ).toLocaleString()}
              </span>
              <Badge
                variant="outline"
                className={qualityStatusClass(qualityStatus.status)}
              >
                {qualityStatus.status}
              </Badge>
            </div>
            <div className="overflow-hidden rounded-md border bg-background">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Check</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Failed rows</TableHead>
                    <TableHead className="text-right">Total rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qualityStatus.checks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell className="min-w-[220px] align-top">
                        <p className="font-medium">{check.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {check.id}
                        </p>
                      </TableCell>
                      <TableCell className="align-top font-mono text-[11px] text-muted-foreground">
                        {check.field ?? "table"}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className={qualityStatusClass(check.status)}
                        >
                          {check.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-right font-mono">
                        {check.failed_rows ?? "?"}
                      </TableCell>
                      <TableCell className="align-top text-right font-mono">
                        {check.total_rows ?? "?"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Run the declared DuckDB checks to verify the current table data.
          </p>
        )}
      </div>

      <div className="border-b px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconActivity size={15} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold">Service-level agreements</h3>
          </div>
          <Badge variant="outline">{slaProperties.length} SLA</Badge>
        </div>
        {!hasStoredSlaProperties && (
          <p className="mb-3 text-xs text-muted-foreground">
            Inferred from Mizumi pipeline defaults. Sync to persist these entries into the
            ODCS YAML.
          </p>
        )}
        {(runtimeLoading || runtimeStatus) && (
          <div
            className={`mb-3 rounded-md border px-3 py-2 text-xs ${
              runtimeStatus?.status === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "bg-muted/40 text-muted-foreground"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <IconAlertTriangle
                  size={14}
                  className={
                    runtimeStatus?.status === "warning"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                  }
                />
                <span className="font-medium">
                  {runtimeLoading
                    ? "Checking Dagster SLA status..."
                    : runtimeStatus?.status === "warning"
                      ? "Dagster SLA warning"
                      : "Dagster SLA status"}
                </span>
              </div>
              {runtimeStatus && (
                <Badge
                  variant={
                    runtimeStatus.status === "warning" ? "destructive" : "secondary"
                  }
                >
                  {runtimeStatus.status}
                </Badge>
              )}
            </div>
            {runtimeStatus?.warnings.length ? (
              <div className="mt-2 space-y-1">
                {runtimeStatus.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : runtimeStatus ? (
              <p className="mt-2">
                Schedule and materialization checks are currently within the declared
                SLA.
              </p>
            ) : null}
            {runtimeStatus && (
              <div className="mt-2 space-y-1 font-mono text-[11px]">
                {[
                  ["schedule", runtimeStatus.dagster.schedule_status ?? "unknown"],
                  ["tick", runtimeStatus.dagster.last_tick_status ?? "unknown"],
                  ["run", runtimeStatus.dagster.latest_run_status ?? "unknown"],
                  [
                    "materialized",
                    formatDagsterTimestamp(
                      runtimeStatus.dagster.latest_materialization_timestamp
                    ),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 gap-2">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {label}:
                    </span>
                    <span className="min-w-0 truncate">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {slaProperties.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No SLA properties are defined in this contract.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {slaProperties.map((sla, index) => {
              const elementTargets = slaElementTargets(
                sla.element,
                catalog,
                schema,
                table
              )
              const actionTargets = slaActionTargets(
                sla,
                catalog,
                schema,
                table,
                streamingJobs
              )

              return (
                <div
                  key={sla.id ?? `${sla.property}-${index}`}
                  className="rounded-md border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">
                        {labelForSlaProperty(sla.property)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {sla.id ?? "unnamed"}
                      </p>
                    </div>
                    {sla.driver && (
                      <Badge variant="secondary" className="shrink-0">
                        {sla.driver}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 space-y-3 text-xs">
                    <div className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Target
                      </p>
                      <p className="mt-1 font-mono">{formatSlaValue(sla)}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Element
                      </p>
                      {elementTargets.length === 0 ? (
                        <p className="mt-1 truncate font-mono">—</p>
                      ) : (
                        <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                          {elementTargets.map((target) => (
                            <Link
                              key={`${sla.id ?? index}-${target.label}`}
                              href={target.href}
                              className="inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-accent"
                              title={`Open ${target.label}`}
                            >
                              <span className="truncate">{target.label}</span>
                              <IconExternalLink size={11} className="shrink-0" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {actionTargets.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {actionTargets.map((target) => (
                        <Link
                          key={`${sla.id ?? index}-${target.label}`}
                          href={target.href}
                          className="inline-flex min-w-0 items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                          title={`Open ${target.label}`}
                        >
                          <span className="truncate">{target.label}</span>
                          <IconExternalLink size={11} className="shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                  {(sla.scheduler || sla.schedule) && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <IconCalendarClock size={13} />
                      <span className="truncate">
                        {sla.scheduler ?? "scheduler"} / {sla.schedule ?? "—"}
                      </span>
                    </div>
                  )}
                  {sla.description && (
                    <div className="mt-3 flex gap-2 text-xs text-muted-foreground">
                      <IconClock size={13} className="mt-0.5 shrink-0" />
                      <p>{sla.description}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-5 py-4">
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
