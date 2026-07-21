"use client"

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
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
  CommandSeparator,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"

const LineageGraph = dynamic(
  () => import("../assets/[...path]/LineageGraph").then((m) => m.LineageGraph),
  { ssr: false }
)

const NODE_TYPE_OPTIONS = [
  { label: "tables", value: "table" },
  { label: "topics", value: "topic" },
  { label: "assets", value: "dagster_asset" },
  { label: "spark jobs", value: "spark_job" },
  { label: "streaming jobs", value: "streaming_job" },
  { label: "daft jobs", value: "daft_job" },
  { label: "dagster jobs", value: "dagster_job" },
  { label: "schedules", value: "schedule" },
  { label: "dashboards", value: "dashboard" },
  { label: "mlflow experiments", value: "mlflow_experiment" },
  { label: "mlflow models", value: "mlflow_model" },
  { label: "pretrained models", value: "pretrained_model" },
  { label: "volumes", value: "volume" },
  { label: "catalogs", value: "catalog" },
  { label: "schemas", value: "schema" },
] as const

const DEFAULT_SELECTED_NODE_TYPES = [
  "table",
  "topic",
  "spark_job",
  "streaming_job",
  "daft_job",
  "mlflow_experiment",
  "mlflow_model",
  "pretrained_model",
  "volume",
  // "dashboard"
  // "schema",
]

export default function LineagePage() {
  const [query, setQuery] = useState("")
  const [runtimeOnly, setRuntimeOnly] = useState(false)
  const [includeContains, setIncludeContains] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>(
    DEFAULT_SELECTED_NODE_TYPES
  )

  const filters = useMemo(
    () => ({
      includeContains,
      nodeTypes: selectedNodeTypes,
      query,
      runtimeOnly,
    }),
    [query, runtimeOnly, includeContains, selectedNodeTypes]
  )

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (query.trim()) {
      count += 1
    }
    if (runtimeOnly) {
      count += 1
    }
    if (includeContains) {
      count += 1
    }
    if (selectedNodeTypes.join("|") !== DEFAULT_SELECTED_NODE_TYPES.join("|")) {
      count += 1
    }
    return count
  }, [includeContains, query, runtimeOnly, selectedNodeTypes])

  function toggleNodeType(nodeType: string) {
    setSelectedNodeTypes((current) =>
      current.includes(nodeType)
        ? current.filter((value) => value !== nodeType)
        : [...current, nodeType]
    )
  }

  function resetFilters() {
    setQuery("")
    setRuntimeOnly(false)
    setIncludeContains(false)
    setSelectedNodeTypes(DEFAULT_SELECTED_NODE_TYPES)
  }

  async function handleRebuild() {
    setRebuilding(true)
    try {
      const res = await fetchWithAuth("/api/lineage/rebuild", {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      setRefreshKey((value) => value + 1)
      toast.success("Lineage rebuilt", {
        description: `${json.nodes_count ?? 0} nodes, ${json.edges_count ?? 0} edges`,
      })
    } catch (err) {
      toast.error("Failed to rebuild lineage", {
        description: (err as Error).message,
      })
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b bg-background/90 backdrop-blur">
        <div className="flex items-center gap-2 overflow-x-auto px-5 py-3">
          <Input
            className="w-full min-w-52 max-w-sm"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lineage"
            value={query}
          />

          <Popover onOpenChange={setFiltersOpen} open={filtersOpen}>
            <PopoverTrigger asChild>
              <Button
                className="shrink-0"
                size="default"
                type="button"
                variant="outline"
              >
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="ml-1" variant="secondary">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <Command>
                <CommandInput placeholder="Search node types" />
                <CommandList>
                  <CommandEmpty>No filter options found.</CommandEmpty>
                  <CommandGroup heading="Node types">
                    {NODE_TYPE_OPTIONS.map((option) => {
                      const checked = selectedNodeTypes.includes(option.value)
                      return (
                        <CommandItem
                          key={option.value}
                          onSelect={() => toggleNodeType(option.value)}
                          value={`${option.label} ${option.value}`}
                        >
                          <Checkbox checked={checked} />
                          <span>{option.label}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Options">
                    <CommandItem
                      onSelect={() => setRuntimeOnly((value) => !value)}
                      value="runtime activity"
                    >
                      <Checkbox checked={runtimeOnly} />
                      <span>Only items with runtime activity</span>
                    </CommandItem>
                    <CommandItem
                      onSelect={() => setIncludeContains((value) => !value)}
                      value="containment edges"
                    >
                      <Checkbox checked={includeContains} />
                      <span>Show catalog/schema containment</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedNodeTypes.length < NODE_TYPE_OPTIONS.length && (
            <Badge className="shrink-0" variant="outline">
              {selectedNodeTypes.length} types
            </Badge>
          )}
          {runtimeOnly && (
            <Badge className="shrink-0" variant="outline">
              runtime
            </Badge>
          )}
          {includeContains && (
            <Badge className="shrink-0" variant="outline">
              containment
            </Badge>
          )}

          <Button
            className="shrink-0"
            onClick={resetFilters}
            size="default"
            type="button"
            variant="ghost"
          >
            Reset
          </Button>

          <Button
            className="ml-auto shrink-0"
            disabled={rebuilding}
            onClick={handleRebuild}
            size="default"
            type="button"
            variant="outline"
          >
            {rebuilding ? "Rebuilding…" : "Rebuild lineage"}
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <LineageGraph
          enableNeighborhoodSelection
          filters={filters}
          key={refreshKey}
        />
      </div>
    </div>
  )
}
