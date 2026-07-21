"use client"

import { IconFlask, IconTag } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { MlflowExperiment } from "@/services/mlflow"
import { searchMlflowExperimentsAction } from "../catalog/actions"

const COLS = ["ID", "Name", "Lifecycle", "Created", "Updated", "Tags"]

function formatTimestamp(value?: number | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<MlflowExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    searchMlflowExperimentsAction()
      .then((data) => setExperiments(data.experiments ?? []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b">
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <IconFlask size={16} className="text-muted-foreground" />
            <h1 className="text-sm font-semibold">Experiments</h1>
          </div>
          {!loading && !error ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {experiments.length} experiment
              {experiments.length !== 1 ? "s" : ""}
            </p>
          ) : null}
          {error ? (
            <p className="mt-1 text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              {COLS.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={COLS.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={COLS.length}
                  className="h-24 text-center font-mono text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : experiments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLS.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No MLflow experiments found
                </TableCell>
              </TableRow>
            ) : (
              experiments.map((experiment) => (
                <TableRow key={experiment.experiment_id}>
                  <TableCell className="font-mono text-muted-foreground">
                    {experiment.experiment_id}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate font-medium">
                    <span className="flex items-center gap-1.5">
                      <IconFlask
                        size={13}
                        className="shrink-0 text-muted-foreground"
                      />
                      {experiment.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        experiment.lifecycle_stage === "active"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {experiment.lifecycle_stage}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(experiment.creation_time)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(experiment.last_update_time)}
                  </TableCell>
                  <TableCell>
                    {(experiment.tags ?? []).length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {(experiment.tags ?? []).slice(0, 3).map((tag) => (
                          <span
                            key={tag.key}
                            className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            <IconTag size={9} className="shrink-0" />
                            {tag.key}={tag.value}
                          </span>
                        ))}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
