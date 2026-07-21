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
  return run.data.tags?.find((tag) => tag.key === key)?.value
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

  function renderRunsBody() {
    if (loading) {
      return <LoadingRow cols={COLS.length} />
    }
    if (error) {
      return <ErrorRow cols={COLS.length} message={error} />
    }
    if (runs.length === 0) {
      return (
        <EmptyRow
          cols={COLS.length}
          message="No MLflow runs linked to this model"
        />
      )
    }
    return runs.map((run, i) => (
      <tr
        className={cn(
          "border-border/60 border-b transition-colors last:border-0 hover:bg-accent/30",
          i % 2 === 0 ? "bg-background" : "bg-muted/20"
        )}
        key={run.info.run_id}
      >
        <td className="max-w-[140px] truncate px-4 py-2 font-medium">
          {run.info.run_name ?? "—"}
        </td>
        <td className="truncate px-4 py-2 font-mono text-muted-foreground">
          {getTag(run, "registered_model_uri") ??
            `models:/${mlflowModelName(model)}@champion`}
        </td>
        <td className="px-4 py-2">
          <StatusBadge status={run.info.status} />
        </td>
        <td className="px-4 py-2 text-muted-foreground">
          <span className="flex items-center gap-1">
            <IconTimeline className="shrink-0" size={13} />
            {formatDuration(run.info.start_time, run.info.end_time)}
          </span>
        </td>
        <td className="px-4 py-2 text-muted-foreground">
          <span className="flex items-center gap-1">
            <IconClock className="shrink-0" size={13} />
            {formatTimestamp(run.info.start_time)}
          </span>
        </td>
      </tr>
    ))
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b px-5 py-3">
        <h3 className="font-semibold text-xs">MLflow Runs</h3>
        {!(loading || error) && (
          <p className="mt-0.5 text-muted-foreground text-xs">
            {runs.length} run{runs.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <table className="w-full border-collapse text-xs">
        <TableHeader cols={COLS} />
        <tbody>{renderRunsBody()}</tbody>
      </table>
    </div>
  )
}
