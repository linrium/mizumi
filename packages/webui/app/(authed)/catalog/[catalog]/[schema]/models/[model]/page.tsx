"use client"

import { IconArchive, IconClock, IconRun, IconUser } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import type { ModelVersionSummary } from "@/services/catalog-types"
import { getModelVersionsAction } from "../../../../actions"
import {
  EmptyRow,
  ErrorRow,
  LoadingRow,
  StatusBadge,
  TableHeader,
  formatTimestamp,
} from "./model-ui"
import { cn } from "@/lib/utils"

const COLS = ["Version", "Status", "Source", "Run ID", "Created", "Comment"]

export default function VersionsPage() {
  const { catalog, schema, model } = useParams<{
    catalog: string
    schema: string
    model: string
  }>()
  const [versions, setVersions] = useState<ModelVersionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getModelVersionsAction(catalog, schema, model)
      .then((d) => setVersions(d.model_versions ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [catalog, schema, model])

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 py-3 border-b">
        <h3 className="text-xs font-semibold">Versions</h3>
        {!loading && !error && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {versions.length} version{versions.length !== 1 ? "s" : ""}
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
          ) : versions.length === 0 ? (
            <EmptyRow cols={COLS.length} message="No model versions found" />
          ) : (
            versions.map((v, i) => (
              <tr
                key={v.id ?? v.version ?? i}
                className={cn(
                  "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                  i % 2 === 0 ? "bg-background" : "bg-muted/20",
                )}
              >
                <td className="px-4 py-2 font-mono font-medium">
                  {v.version ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <IconArchive
                      size={13}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="font-mono text-muted-foreground truncate">
                      {v.source ?? v.storage_location ?? "—"}
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
                      {v.run_id ?? "—"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <IconClock size={13} className="shrink-0" />
                    {formatTimestamp(v.created_at)}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <IconUser size={13} className="shrink-0" />
                    <span className="truncate">
                      {v.comment ?? v.created_by ?? "—"}
                    </span>
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
