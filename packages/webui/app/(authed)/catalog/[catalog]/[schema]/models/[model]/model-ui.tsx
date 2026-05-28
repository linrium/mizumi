"use client"

import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function formatTimestamp(value?: number | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatDuration(
  startMs?: number | null,
  endMs?: number | null,
) {
  if (!startMs) return "—"
  const end = endMs ?? Date.now()
  const secs = Math.round((end - startMs) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`
}

export function Field({
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

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  const colors: Record<string, string> = {
    FINISHED: "bg-green-500/10 text-green-600 dark:text-green-400",
    RUNNING: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    FAILED: "bg-destructive/10 text-destructive",
    KILLED: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    SCHEDULED: "bg-muted text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        colors[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  )
}

export function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
      <tr>
        {cols.map((h) => (
          <th
            key={h}
            className="px-4 py-2 text-left font-medium text-muted-foreground border-b"
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="px-5 py-8 text-center text-xs text-muted-foreground"
      >
        {message}
      </td>
    </tr>
  )
}

export function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-4 text-xs text-muted-foreground">
        Loading…
      </td>
    </tr>
  )
}

export function ErrorRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="px-5 py-4 text-xs text-destructive font-mono"
      >
        {message}
      </td>
    </tr>
  )
}
