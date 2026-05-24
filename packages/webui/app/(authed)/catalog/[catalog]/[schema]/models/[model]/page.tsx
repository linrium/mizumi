"use client"

import {
  IconArchive,
  IconClock,
  IconCopy,
  IconRun,
  IconUser,
} from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ModelVersionSummary } from "@/services/catalog-types"
import { getModelVersionsAction } from "../../../../actions"
import { useModelDetail } from "./model-context"

function formatTimestamp(value?: number) {
  if (!value) return "—"
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function Field({
  label,
  value,
  mono,
  copyValue,
}: {
  label: string
  value?: string | number | null
  mono?: boolean
  copyValue?: string | null
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="group/field mt-0.5 flex min-w-0 items-center gap-1.5">
        <p
          className={cn(
            "text-xs truncate",
            mono && "font-mono",
            !value && "text-muted-foreground",
          )}
        >
          {value || "—"}
        </p>
        {copyValue && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(copyValue)
              toast.success("Copied to clipboard")
            }}
            className="shrink-0 opacity-0 group-hover/field:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            aria-label={`Copy ${label.toLowerCase()}`}
          >
            <IconCopy size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function ModelDetailPage() {
  const detail = useModelDetail()
  const { catalog, schema, model } = useParams<{
    catalog: string
    schema: string
    model: string
  }>()
  const [versions, setVersions] = useState<ModelVersionSummary[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [versionsError, setVersionsError] = useState<string | null>(null)

  useEffect(() => {
    setLoadingVersions(true)
    setVersionsError(null)
    getModelVersionsAction(catalog, schema, model)
      .then((data) => setVersions(data.model_versions ?? []))
      .catch((e: Error) => setVersionsError(e.message))
      .finally(() => setLoadingVersions(false))
  }, [catalog, schema, model])

  if (!detail) return null

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-3 border-b shrink-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Field label="Created" value={formatTimestamp(detail.created_at)} />
        <Field label="Updated" value={formatTimestamp(detail.updated_at)} />
        <Field
          label="Storage"
          value={detail.storage_location}
          mono
          copyValue={detail.storage_location}
        />
        <Field label="Model ID" value={detail.id} mono />
      </div>

      <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold">Versions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {versions.length} version{versions.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {loadingVersions && (
        <p className="px-5 py-4 text-xs text-muted-foreground">
          Loading versions…
        </p>
      )}
      {versionsError && (
        <p className="px-5 py-4 text-xs text-destructive font-mono">
          {versionsError}
        </p>
      )}

      {!loadingVersions && !versionsError && (
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                Version
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                Status
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                Source
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                Run
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                Created
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                Comment
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version, i) => (
              <tr
                key={version.id ?? version.version ?? i}
                className={cn(
                  "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                  i % 2 === 0 ? "bg-background" : "bg-muted/20",
                )}
              >
                <td className="px-4 py-2 font-mono font-medium">
                  {version.version ?? "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {version.status ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <IconArchive
                      size={13}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="font-mono text-muted-foreground truncate">
                      {version.source ?? version.storage_location ?? "—"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <IconRun
                      size={13}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="font-mono text-muted-foreground truncate">
                      {version.run_id ?? "—"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <IconClock size={13} className="shrink-0" />
                    {formatTimestamp(version.created_at)}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <IconUser size={13} className="shrink-0" />
                    <span className="truncate">
                      {version.comment ?? version.created_by ?? "—"}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
            {versions.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-muted-foreground"
                >
                  No model versions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
