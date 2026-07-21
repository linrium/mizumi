"use client"

import { IconClock, IconTimeline } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { MlflowRun } from "@/services/mlflow"
import { searchMlflowRunsAction } from "../../../../../actions"
import {
  EmptyRow,
  ErrorRow,
  formatDuration,
  formatTimestamp,
  LoadingRow,
  StatusBadge,
  TableHeader,
} from "../model-ui"

const COLS = ["Name", "Model", "Status", "Duration", "Started"]

function getTag(run: MlflowRun, key: string) {
  return run.data?.tags?.find((tag) => tag.key === key)?.value
}

function mlflowModelName(model: string) {
  return model.replaceAll("_", "-")
}

export default function RunsPage() {
  const { model } = useParams<{
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
      const registeredModelUri = `models:/${mlflowModelName(model)}@champion`
      const runsData = await searchMlflowRunsAction(["1"], {
        registeredModelUri,
      })
      return runsData.runs ?? []
    }

    load()
      .then(setRuns)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [model])

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
              return (
                <tr
                  key={run.info.run_id}
                  className={cn(
                    "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-4 py-2 font-medium truncate max-w-[140px]">
                    {run.info.run_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-muted-foreground truncate">
                    {getTag(run, "registered_model_uri") ??
                      `models:/${mlflowModelName(model)}@champion`}
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
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
