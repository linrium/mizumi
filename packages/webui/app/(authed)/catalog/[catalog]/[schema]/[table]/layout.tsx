"use client"

import {
  IconCopy,
  IconEyeTable,
  IconKey,
  IconSchema,
  IconShieldLock,
  IconTable,
} from "@tabler/icons-react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getTableAction } from "../../../actions"
import { TableContext, type TableDetail } from "./table-context"

type Tab = "schema" | "preview" | "permissions" | "request-permissions"

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
    : pathname.endsWith("/request-permissions")
      ? "request-permissions"
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
          : tab === "permissions"
            ? `${basePath}/permissions`
            : `${basePath}/request-permissions`,
    )
  }

  return (
    <TableContext value={detail}>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <IconTable size={15} className="text-muted-foreground" />
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
              <IconCopy size={12} />
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
              { key: "schema", label: "schema", icon: IconSchema },
              { key: "preview", label: "preview", icon: IconEyeTable },
              {
                key: "permissions",
                label: "permissions",
                icon: IconShieldLock,
              },
              {
                key: "request-permissions",
                label: "request access",
                icon: IconKey,
              },
            ] satisfies {
              key: Tab
              label: string
              icon: typeof IconTable
            }[]
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
                <tab.icon size={12} />
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
