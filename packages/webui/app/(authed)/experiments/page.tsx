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
  if (!value) {
    return "-"
  }
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

  function renderExperimentsBody() {
    if (loading) {
      return (
        <TableRow>
          <TableCell
            className="h-24 text-center text-muted-foreground"
            colSpan={COLS.length}
          >
            Loading...
          </TableCell>
        </TableRow>
      )
    }
    if (error) {
      return (
        <TableRow>
          <TableCell
            className="h-24 text-center font-mono text-destructive"
            colSpan={COLS.length}
          >
            {error}
          </TableCell>
        </TableRow>
      )
    }
    if (experiments.length === 0) {
      return (
        <TableRow>
          <TableCell
            className="h-24 text-center text-muted-foreground"
            colSpan={COLS.length}
          >
            No MLflow experiments found
          </TableCell>
        </TableRow>
      )
    }
    return experiments.map((experiment) => (
      <TableRow key={experiment.experiment_id}>
        <TableCell className="font-mono text-muted-foreground">
          {experiment.experiment_id}
        </TableCell>
        <TableCell className="max-w-[240px] truncate font-medium">
          <span className="flex items-center gap-1.5">
            <IconFlask className="shrink-0 text-muted-foreground" size={13} />
            {experiment.name}
          </span>
        </TableCell>
        <TableCell>
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
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
                  className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                  key={tag.key}
                >
                  <IconTag className="shrink-0" size={9} />
                  {tag.key}={tag.value}
                </span>
              ))}
            </span>
          )}
        </TableCell>
      </TableRow>
    ))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b">
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <IconFlask className="text-muted-foreground" size={16} />
            <h1 className="font-semibold text-sm">Experiments</h1>
          </div>
          {loading || error ? null : (
            <p className="mt-0.5 text-muted-foreground text-xs">
              {experiments.length} experiment
              {experiments.length === 1 ? "" : "s"}
            </p>
          )}
          {error ? (
            <p className="mt-1 text-destructive text-xs">{error}</p>
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
          <TableBody>{renderExperimentsBody()}</TableBody>
        </Table>
      </div>
    </div>
  )
}
