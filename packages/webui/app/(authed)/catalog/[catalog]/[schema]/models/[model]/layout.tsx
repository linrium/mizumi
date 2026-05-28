"use client"

import {
  IconBrain,
  IconCopy,
  IconFlask,
  IconHistory,
  IconRun,
  IconTimeline,
} from "@tabler/icons-react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getModelAction } from "../../../../actions"
import { Field, formatTimestamp } from "./model-ui"
import { ModelContext, type RegisteredModelDetail } from "./model-context"

type Tab = "versions" | "runs" | "experiments" | "traces"

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "versions", label: "Versions", icon: IconHistory },
  { key: "runs", label: "Runs", icon: IconRun },
  { key: "experiments", label: "Experiments", icon: IconFlask },
  { key: "traces", label: "Traces", icon: IconTimeline },
]

export default function ModelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { catalog, schema, model } = useParams<{
    catalog: string
    schema: string
    model: string
  }>()
  const pathname = usePathname()
  const router = useRouter()
  const [detail, setDetail] = useState<RegisteredModelDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeTab: Tab = pathname.endsWith("/runs")
    ? "runs"
    : pathname.endsWith("/experiments")
      ? "experiments"
      : pathname.endsWith("/traces")
        ? "traces"
        : "versions"

  useEffect(() => {
    setDetail(null)
    setError(null)
    getModelAction(catalog, schema, model)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [catalog, schema, model])

  if (error) {
    return <div className="p-4 text-sm text-destructive font-mono">{error}</div>
  }
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const fullPath =
    detail.full_name ??
    `${detail.catalog_name}.${detail.schema_name}.${detail.name}`

  const basePath = `/catalog/${catalog}/${schema}/models/${model}`

  function navigate(tab: Tab) {
    router.push(tab === "versions" ? basePath : `${basePath}/${tab}`)
  }

  return (
    <ModelContext value={detail}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <IconBrain size={15} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">{detail.name}</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              model
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 group/path">
            <p className="text-xs text-muted-foreground font-mono">{fullPath}</p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fullPath)
                toast.success("Copied to clipboard")
              }}
              className="opacity-0 group-hover/path:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            >
              <IconCopy size={12} />
            </button>
          </div>
          {detail.comment && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              {detail.comment}
            </p>
          )}
        </div>

        {/* Metadata fields */}
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

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-5 border-b shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.key)}
              className={cn(
                "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                <tab.icon size={12} />
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {children}
      </div>
    </ModelContext>
  )
}
