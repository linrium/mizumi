"use client"

import { IconClock, IconRun, IconTag } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { MlflowLoggedModel } from "@/services/mlflow"
import { searchMlflowLoggedModelsAction } from "../../../../actions"
import {
  EmptyRow,
  ErrorRow,
  formatTimestamp,
  LoadingRow,
  StatusBadge,
  TableHeader,
} from "./model-ui"

const COLS = ["Model", "Version", "Status", "Run", "Created"]

function getTag(model: MlflowLoggedModel, key: string) {
  return model.info.tags?.find((tag) => tag.key === key)?.value
}

function mlflowModelName(model: string) {
  return model.replaceAll("_", "-")
}

function getRegisteredVersions(
  loggedModel: MlflowLoggedModel,
  modelName: string
) {
  const tag = getTag(loggedModel, "mlflow.modelVersions")
  if (!tag) return []

  try {
    const parsed = JSON.parse(tag) as {
      name?: string
      version?: string | number
    }[]
    return parsed
      .filter((version) => version.name === modelName)
      .map((version) => String(version.version))
      .filter((version, index, versions) => versions.indexOf(version) === index)
  } catch {
    return []
  }
}

export default function ModelsPage() {
  const { model } = useParams<{
    catalog: string
    schema: string
    model: string
  }>()
  const [models, setModels] = useState<MlflowLoggedModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const modelName = mlflowModelName(model)
    searchMlflowLoggedModelsAction()
      .then((data) =>
        setModels(
          (data.models ?? []).filter(
            (loggedModel) =>
              getRegisteredVersions(loggedModel, modelName).length > 0
          )
        )
      )
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [model])

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-3 border-b">
        <h3 className="text-xs font-semibold">Models</h3>
        {!loading && !error && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {models.length} model{models.length !== 1 ? "s" : ""}
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
          ) : models.length === 0 ? (
            <EmptyRow cols={COLS.length} message="No logged models found" />
          ) : (
            models.map((loggedModel, i) => {
              const versions = getRegisteredVersions(
                loggedModel,
                mlflowModelName(model)
              )

              return (
                <tr
                  key={loggedModel.info.model_id}
                  className={cn(
                    "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-4 py-2 font-medium">
                    {loggedModel.info.name}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap gap-1">
                      {versions.length > 0 ? (
                        versions.map((version) => (
                          <span
                            key={version}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            <IconTag size={11} />v{version}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={loggedModel.info.status} />
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <IconRun
                        size={13}
                        className="shrink-0 text-muted-foreground"
                      />
                      <span className="font-mono text-muted-foreground truncate">
                        {loggedModel.info.source_run_id ?? "—"}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <IconClock size={13} className="shrink-0" />
                      {formatTimestamp(loggedModel.info.creation_timestamp_ms)}
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
