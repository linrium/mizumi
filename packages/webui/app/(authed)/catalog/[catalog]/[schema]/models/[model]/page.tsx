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
  if (!tag) {
    return []
  }

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

  function renderModelsBody() {
    if (loading) {
      return <LoadingRow cols={COLS.length} />
    }
    if (error) {
      return <ErrorRow cols={COLS.length} message={error} />
    }
    if (models.length === 0) {
      return <EmptyRow cols={COLS.length} message="No logged models found" />
    }
    return models.map((loggedModel, i) => {
      const versions = getRegisteredVersions(
        loggedModel,
        mlflowModelName(model)
      )

      return (
        <tr
          className={cn(
            "border-border/60 border-b transition-colors last:border-0 hover:bg-accent/30",
            i % 2 === 0 ? "bg-background" : "bg-muted/20"
          )}
          key={loggedModel.info.model_id}
        >
          <td className="px-4 py-2 font-medium">{loggedModel.info.name}</td>
          <td className="px-4 py-2">
            <span className="flex flex-wrap gap-1">
              {versions.length > 0 ? (
                versions.map((version) => (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                    key={version}
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
            <span className="flex min-w-0 items-center gap-1.5">
              <IconRun className="shrink-0 text-muted-foreground" size={13} />
              <span className="truncate font-mono text-muted-foreground">
                {loggedModel.info.source_run_id ?? "—"}
              </span>
            </span>
          </td>
          <td className="px-4 py-2 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <IconClock className="shrink-0" size={13} />
              {formatTimestamp(loggedModel.info.creation_timestamp_ms)}
            </span>
          </td>
        </tr>
      )
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b px-5 py-3">
        <h3 className="font-semibold text-xs">Models</h3>
        {!(loading || error) && (
          <p className="mt-0.5 text-muted-foreground text-xs">
            {models.length} model{models.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <table className="w-full border-collapse text-xs">
        <TableHeader cols={COLS} />
        <tbody>{renderModelsBody()}</tbody>
      </table>
    </div>
  )
}
