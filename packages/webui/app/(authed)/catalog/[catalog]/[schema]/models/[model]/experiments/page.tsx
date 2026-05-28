"use client"

import { IconFlask, IconTag } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import type { MlflowExperiment } from "@/services/mlflow"
import { searchMlflowExperimentsAction } from "../../../../../actions"
import {
  EmptyRow,
  ErrorRow,
  LoadingRow,
  TableHeader,
  formatTimestamp,
} from "../model-ui"
import { cn } from "@/lib/utils"

const COLS = ["ID", "Name", "Lifecycle", "Created", "Updated", "Tags"]

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<MlflowExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    searchMlflowExperimentsAction()
      .then((d) => setExperiments(d.experiments ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-3 border-b">
        <h3 className="text-xs font-semibold">MLflow Experiments</h3>
        {!loading && !error && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {experiments.length} experiment{experiments.length !== 1 ? "s" : ""}
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
          ) : experiments.length === 0 ? (
            <EmptyRow cols={COLS.length} message="No MLflow experiments found" />
          ) : (
            experiments.map((exp, i) => (
              <tr
                key={exp.experiment_id}
                className={cn(
                  "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                  i % 2 === 0 ? "bg-background" : "bg-muted/20",
                )}
              >
                <td className="px-4 py-2 font-mono text-muted-foreground">
                  {exp.experiment_id}
                </td>
                <td className="px-4 py-2 font-medium truncate max-w-[200px]">
                  <span className="flex items-center gap-1.5">
                    <IconFlask
                      size={13}
                      className="shrink-0 text-muted-foreground"
                    />
                    {exp.name}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      exp.lifecycle_stage === "active"
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {exp.lifecycle_stage}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatTimestamp(exp.creation_time)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatTimestamp(exp.last_update_time)}
                </td>
                <td className="px-4 py-2">
                  {(exp.tags ?? []).length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {(exp.tags ?? []).slice(0, 3).map((t) => (
                        <span
                          key={t.key}
                          className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                        >
                          <IconTag size={9} className="shrink-0" />
                          {t.key}={t.value}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
