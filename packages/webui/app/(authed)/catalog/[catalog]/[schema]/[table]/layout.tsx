"use client"

import { Copy01Icon, SecurityIcon, TableIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { getTableAction } from "../../../actions"
import { cn } from "@/lib/utils"
import { TableContext, type TableDetail } from "./table-context"

type Tab = "schema" | "preview" | "permissions"

export default function TableLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { catalog, schema, table } = useParams<{
    catalog: string
    schema: string
    table: string
  }>()
  const pathname = usePathname()
  const router = useRouter()
  const [detail, setDetail] = useState<TableDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeTab: Tab = pathname.endsWith("/preview")
    ? "preview"
    : pathname.endsWith("/permissions")
      ? "permissions"
      : "schema"

  useEffect(() => {
    setDetail(null)
    setError(null)
    getTableAction(catalog, schema, table)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [catalog, schema, table])

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

  const fullPath = `${detail.catalog_name}.${detail.schema_name}.${detail.name}`
  const basePath = `/catalog/${catalog}/${schema}/${table}`

  function navigate(tab: Tab) {
    router.push(
      tab === "schema"
        ? basePath
        : tab === "preview"
          ? `${basePath}/preview`
          : `${basePath}/permissions`,
    )
  }

  return (
    <TableContext value={detail}>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <HugeiconsIcon
              icon={TableIcon}
              size={15}
              className="text-muted-foreground"
            />
            <h2 className="text-sm font-semibold">{detail.name}</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {detail.table_type}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 group/path">
            <p className="text-xs text-muted-foreground font-mono">
              {fullPath}
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fullPath)
                toast.success("Copied to clipboard")
              }}
              className="opacity-0 group-hover/path:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Copy01Icon} size={12} />
            </button>
          </div>
          {detail.comment && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              {detail.comment}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0 px-5 border-b shrink-0">
          {(
            [
              { key: "schema", label: "schema" },
              { key: "preview", label: "preview" },
              { key: "permissions", label: "permissions" },
            ] satisfies { key: Tab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.key)}
              className={cn(
                "px-3 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors",
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                {tab.key === "permissions" && (
                  <HugeiconsIcon icon={SecurityIcon} size={12} />
                )}
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {children}
      </div>
    </TableContext>
  )
}
