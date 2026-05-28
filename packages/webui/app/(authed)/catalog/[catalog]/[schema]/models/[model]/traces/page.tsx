"use client"

import { IconClock, IconTag } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import type { MlflowTrace } from "@/services/mlflow"
import {
  listMlflowTracesAction,
  searchMlflowExperimentsAction,
} from "../../../../../actions"
import {
  EmptyRow,
  ErrorRow,
  LoadingRow,
  StatusBadge,
  TableHeader,
  formatTimestamp,
} from "../model-ui"
import { cn } from "@/lib/utils"

const COLS = ["Request ID", "Experiment", "Status", "Duration", "Started", "Tags"]

export default function TracesPage() {
  const [traces, setTraces] = useState<MlflowTrace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    async function load() {
      const expsData = await searchMlflowExperimentsAction()
      const expIds = (expsData.experiments ?? []).map((e) => e.experiment_id)
      if (expIds.length === 0) return []

      const results = await Promise.allSettled(
        expIds.map((id) => listMlflowTracesAction(id)),
      )
      return results
        .filter(
          (r): r is PromiseFulfilledResult<{ traces?: MlflowTrace[] }> =>
            r.status === "fulfilled",
        )
        .flatMap((r) => r.value.traces ?? [])
    }

    load()
      .then(setTraces)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-3 border-b">
        <h3 className="text-xs font-semibold">MLflow Traces</h3>
        {!loading && !error && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {traces.length} trace{traces.length !== 1 ? "s" : ""}
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
          ) : traces.length === 0 ? (
            <EmptyRow cols={COLS.length} message="No MLflow traces found" />
          ) : (
            traces.map((trace, i) => (
              <tr
                key={trace.request_id}
                className={cn(
                  "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                  i % 2 === 0 ? "bg-background" : "bg-muted/20",
                )}
              >
                <td className="px-4 py-2 font-mono text-muted-foreground truncate max-w-[140px]">
                  {trace.request_id}
                </td>
                <td className="px-4 py-2 font-mono text-muted-foreground">
                  {trace.experiment_id}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={trace.status} />
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {trace.execution_time_ms != null
                    ? `${trace.execution_time_ms}ms`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <IconClock size={13} className="shrink-0" />
                    {formatTimestamp(trace.timestamp_ms)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {(trace.tags ?? []).length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {(trace.tags ?? []).slice(0, 3).map((t) => (
                        <span
                          key={t.key}
                          className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                        >
                          <IconTag size={9} className="shrink-0" />
                          {t.key}
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
