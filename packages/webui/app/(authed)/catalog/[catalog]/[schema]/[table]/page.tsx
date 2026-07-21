"use client"

import { cn } from "@/lib/utils"
import { useTableDetail } from "./table-context"

export default function TableSchemaPage() {
  const detail = useTableDetail()

  if (!detail) {
    return null
  }

  return (
    <div className="flex-1 overflow-auto">
      {Boolean(detail.data_source_format || detail.storage_location) && (
        <div className="flex shrink-0 flex-wrap gap-4 border-b px-5 py-3">
          {Boolean(detail.data_source_format) && (
            <div>
              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                Format
              </p>
              <p className="mt-0.5 text-xs">{detail.data_source_format}</p>
            </div>
          )}
          {Boolean(detail.storage_location) && (
            <div className="min-w-0">
              <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                Location
              </p>
              <p className="mt-0.5 truncate font-mono text-xs">
                {detail.storage_location}
              </p>
            </div>
          )}
        </div>
      )}
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <tr>
            <th className="border-b px-4 py-2 text-left font-medium text-muted-foreground">
              Column
            </th>
            <th className="border-b px-4 py-2 text-left font-medium text-muted-foreground">
              Type
            </th>
            <th className="border-b px-4 py-2 text-left font-medium text-muted-foreground">
              Nullable
            </th>
            <th className="border-b px-4 py-2 text-left font-medium text-muted-foreground">
              Comment
            </th>
          </tr>
        </thead>
        <tbody>
          {detail.columns.map((col, i) => (
            <tr
              className={cn(
                "border-border/60 border-b transition-colors last:border-0 hover:bg-accent/30",
                i % 2 === 0 ? "bg-background" : "bg-muted/20"
              )}
              key={col.name}
            >
              <td className="px-4 py-2 font-medium font-mono">{col.name}</td>
              <td className="px-4 py-2 font-mono text-muted-foreground">
                {col.type_text}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {col.nullable ? "yes" : "no"}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {col.comment?.trim() || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
