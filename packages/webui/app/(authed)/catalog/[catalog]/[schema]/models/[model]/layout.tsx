"use client"

import { IconBoxModel, IconBrain, IconCopy, IconRun } from "@tabler/icons-react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getModelAction } from "../../../../actions"
import { ModelContext, type RegisteredModelDetail } from "./model-context"

type Tab = "models" | "runs"

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { icon: IconBoxModel, key: "models", label: "Models" },
  { icon: IconRun, key: "runs", label: "Runs" },
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

  const activeTab: Tab = pathname.endsWith("/runs") ? "runs" : "models"

  useEffect(() => {
    setDetail(null)
    setError(null)
    getModelAction(catalog, schema, model)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [catalog, schema, model])

  if (error) {
    return <div className="p-4 font-mono text-destructive text-sm">{error}</div>
  }
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  const fullPath =
    detail.full_name ??
    `${detail.catalog_name}.${detail.schema_name}.${detail.name}`

  const basePath = `/catalog/${catalog}/${schema}/models/${model}`

  function navigate(tab: Tab) {
    router.push(tab === "models" ? basePath : `${basePath}/${tab}`)
  }

  return (
    <ModelContext value={detail}>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b px-5 py-4">
          <div className="mb-0.5 flex items-center gap-2">
            <IconBrain className="text-muted-foreground" size={15} />
            <h2 className="font-semibold text-sm">{detail.name}</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
              model
            </span>
          </div>
          <div className="group/path mt-1 flex items-center gap-1.5">
            <p className="font-mono text-muted-foreground text-xs">
              {fullPath}
            </p>
            <button
              className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/path:opacity-100"
              onClick={() => {
                navigator.clipboard.writeText(fullPath)
                toast.success("Copied to clipboard")
              }}
              type="button"
            >
              <IconCopy size={12} />
            </button>
          </div>
          {detail.comment ? (
            <p className="mt-1.5 text-muted-foreground text-xs italic">
              {detail.comment}
            </p>
          ) : null}
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 items-center gap-0 border-b px-5">
          {TABS.map((tab) => (
            <button
              className={cn(
                "-mb-px border-b-2 px-3 py-2 font-medium text-xs transition-colors",
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              key={tab.key}
              onClick={() => navigate(tab.key)}
              type="button"
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
