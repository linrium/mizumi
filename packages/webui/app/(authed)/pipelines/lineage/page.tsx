"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiFetch as fetchWithAuth } from "@/lib/api-client";

const LineageGraph = dynamic(
  () => import("../assets/[...path]/LineageGraph").then((m) => m.LineageGraph),
  { ssr: false },
);

const NODE_TYPE_OPTIONS = [
  { value: "table", label: "tables" },
  { value: "topic", label: "topics" },
  { value: "dagster_asset", label: "assets" },
  { value: "spark_job", label: "spark jobs" },
  { value: "streaming_job", label: "streaming jobs" },
  { value: "daft_job", label: "daft jobs" },
  { value: "dagster_job", label: "dagster jobs" },
  { value: "schedule", label: "schedules" },
  { value: "dashboard", label: "dashboards" },
  { value: "mlflow_experiment", label: "mlflow experiments" },
  { value: "mlflow_model", label: "mlflow models" },
  { value: "pretrained_model", label: "pretrained models" },
  { value: "volume", label: "volumes" },
  { value: "catalog", label: "catalogs" },
  { value: "schema", label: "schemas" },
] as const;

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
];

export default function LineagePage() {
  const [query, setQuery] = useState("");
  const [runtimeOnly, setRuntimeOnly] = useState(false);
  const [includeContains, setIncludeContains] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>(
    DEFAULT_SELECTED_NODE_TYPES,
  );

  const filters = useMemo(
    () => ({
      query,
      runtimeOnly,
      includeContains,
      nodeTypes: selectedNodeTypes,
    }),
    [query, runtimeOnly, includeContains, selectedNodeTypes],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count += 1;
    if (runtimeOnly) count += 1;
    if (includeContains) count += 1;
    if (selectedNodeTypes.join("|") !== DEFAULT_SELECTED_NODE_TYPES.join("|")) {
      count += 1;
    }
    return count;
  }, [includeContains, query, runtimeOnly, selectedNodeTypes]);

  function toggleNodeType(nodeType: string) {
    setSelectedNodeTypes((current) =>
      current.includes(nodeType)
        ? current.filter((value) => value !== nodeType)
        : [...current, nodeType],
    );
  }

  function resetFilters() {
    setQuery("");
    setRuntimeOnly(false);
    setIncludeContains(false);
    setSelectedNodeTypes(DEFAULT_SELECTED_NODE_TYPES);
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      const res = await fetchWithAuth("/api/lineage/rebuild", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRefreshKey((value) => value + 1);
      toast.success("Lineage rebuilt", {
        description: `${json.nodes_count ?? 0} nodes, ${json.edges_count ?? 0} edges`,
      });
    } catch (err) {
      toast.error("Failed to rebuild lineage", {
        description: (err as Error).message,
      });
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="border-b bg-background/90 backdrop-blur shrink-0">
        <div className="px-5 py-3 flex items-center gap-2 overflow-x-auto">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lineage"
            className="w-full min-w-52 max-w-sm"
          />

          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="default"
                className="shrink-0"
              >
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
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
                      const checked = selectedNodeTypes.includes(option.value);
                      return (
                        <CommandItem
                          key={option.value}
                          value={`${option.label} ${option.value}`}
                          onSelect={() => toggleNodeType(option.value)}
                        >
                          <Checkbox checked={checked} />
                          <span>{option.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Options">
                    <CommandItem
                      value="runtime activity"
                      onSelect={() => setRuntimeOnly((value) => !value)}
                    >
                      <Checkbox checked={runtimeOnly} />
                      <span>Only items with runtime activity</span>
                    </CommandItem>
                    <CommandItem
                      value="containment edges"
                      onSelect={() => setIncludeContains((value) => !value)}
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
            <Badge variant="outline" className="shrink-0">
              {selectedNodeTypes.length} types
            </Badge>
          )}
          {runtimeOnly && (
            <Badge variant="outline" className="shrink-0">
              runtime
            </Badge>
          )}
          {includeContains && (
            <Badge variant="outline" className="shrink-0">
              containment
            </Badge>
          )}

          <Button
            type="button"
            variant="ghost"
            size="default"
            onClick={resetFilters}
            className="shrink-0"
          >
            Reset
          </Button>

          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={handleRebuild}
            disabled={rebuilding}
            className="shrink-0 ml-auto"
          >
            {rebuilding ? "Rebuilding…" : "Rebuild lineage"}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <LineageGraph
          key={refreshKey}
          filters={filters}
          enableNeighborhoodSelection
        />
      </div>
    </div>
  );
}
