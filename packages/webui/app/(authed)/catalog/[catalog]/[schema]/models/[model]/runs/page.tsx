"use client"

import { IconClock, IconTimeline } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import type { MlflowRun } from "@/services/mlflow"
import {
  getMlflowRunsForVersionsAction,
  getModelVersionsAction,
  searchMlflowExperimentsAction,
  searchMlflowRunsAction,
} from "../../../../../actions"
import {
  EmptyRow,
  ErrorRow,
  LoadingRow,
  StatusBadge,
  TableHeader,
  formatDuration,
  formatTimestamp,
} from "../model-ui"
import { cn } from "@/lib/utils"

const COLS = ["Run ID", "Name", "Experiment", "Status", "Duration", "Started", "Metrics"]

export default function RunsPage() {
  const { catalog, schema, model } = useParams<{
    catalog: string
    schema: string
    model: string
  }>()
  const [runs, setRuns] = useState<MlflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    async function load() {
      const versionsData = await getModelVersionsAction(catalog, schema, model)
      const runIds = (versionsData.model_versions ?? [])
        .map((v) => v.run_id)
        .filter((id): id is string => Boolean(id))

      if (runIds.length > 0) {
        const fetched = await getMlflowRunsForVersionsAction(runIds)
        if (fetched.length > 0) return fetched
      }

      const expsData = await searchMlflowExperimentsAction()
      const expIds = (expsData.experiments ?? []).map((e) => e.experiment_id)
      if (expIds.length === 0) return []

      const runsData = await searchMlflowRunsAction(expIds)
      return runsData.runs ?? []
    }

    load()
      .then(setRuns)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [catalog, schema, model])

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-3 border-b">
        <h3 className="text-xs font-semibold">MLflow Runs</h3>
        {!loading && !error && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {runs.length} run{runs.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <table className="w-full text-xs border-collapse">
        <TableHeader cols={COLS} />
        <tbody>
          {loading ? (
            <LoadingRow cols={COLS.length} />
          ) : error ? (
            <ErrorRow cols={COLS.length} message={error} />
          ) : runs.length === 0 ? (
            <EmptyRow
              cols={COLS.length}
              message="No MLflow runs linked to this model"
            />
          ) : (
            runs.map((run, i) => {
              const metrics = run.data?.metrics ?? []
              const topMetrics = metrics.slice(0, 3)
              return (
                <tr
                  key={run.info.run_id}
                  className={cn(
                    "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  <td className="px-4 py-2 font-mono text-muted-foreground truncate max-w-[120px]">
                    {run.info.run_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2 font-medium truncate max-w-[140px]">
                    {run.info.run_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-muted-foreground truncate">
                    {run.info.experiment_id}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={run.info.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <IconTimeline size={13} className="shrink-0" />
                      {formatDuration(run.info.start_time, run.info.end_time)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <IconClock size={13} className="shrink-0" />
                      {formatTimestamp(run.info.start_time)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {topMetrics.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {topMetrics.map((m) => (
                          <span key={m.key} className="font-mono text-[10px]">
                            <span className="text-muted-foreground">
                              {m.key}=
                            </span>
                            {typeof m.value === "number"
                              ? m.value.toPrecision(4)
                              : m.value}
                          </span>
                        ))}
                        {metrics.length > 3 && (
                          <span className="text-muted-foreground text-[10px]">
                            +{metrics.length - 3} more
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
