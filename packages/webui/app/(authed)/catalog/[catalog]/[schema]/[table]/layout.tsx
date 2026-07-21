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

const TAB_FROM_PATH_SUFFIX: Array<{ suffix: string; tab: Tab }> = [
  { suffix: "/preview", tab: "preview" },
  { suffix: "/request-permissions", tab: "request-permissions" },
  { suffix: "/permissions", tab: "permissions" },
]

const TAB_PATH_SUFFIX: Record<Tab, string> = {
  permissions: "/permissions",
  preview: "/preview",
  "request-permissions": "/request-permissions",
  schema: "",
}

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

  const activeTab: Tab =
    TAB_FROM_PATH_SUFFIX.find(({ suffix }) => pathname.endsWith(suffix))?.tab ??
    "schema"

  useEffect(() => {
    setDetail(null)
    setError(null)
    getTableAction(catalog, schema, table)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [catalog, schema, table])

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

  const fullPath = `${detail.catalog_name}.${detail.schema_name}.${detail.name}`
  const basePath = `/catalog/${catalog}/${schema}/${table}`

  function navigate(tab: Tab) {
    router.push(`${basePath}${TAB_PATH_SUFFIX[tab]}`)
  }

  return (
    <TableContext value={detail}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b px-5 py-4">
          <div className="mb-0.5 flex items-center gap-2">
            <IconTable className="text-muted-foreground" size={15} />
            <h2 className="font-semibold text-sm">{detail.name}</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
              {detail.table_type}
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

        <div className="flex shrink-0 items-center gap-0 border-b px-5">
          {(
            [
              { icon: IconSchema, key: "schema", label: "schema" },
              { icon: IconEyeTable, key: "preview", label: "preview" },
              {
                icon: IconShieldLock,
                key: "permissions",
                label: "permissions",
              },
              {
                icon: IconKey,
                key: "request-permissions",
                label: "request access",
              },
            ] satisfies {
              key: Tab
              label: string
              icon: typeof IconTable
            }[]
          ).map((tab) => (
            <button
              className={cn(
                "-mb-px border-b-2 px-3 py-2 font-medium text-xs capitalize transition-colors",
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
    </TableContext>
  )
}
