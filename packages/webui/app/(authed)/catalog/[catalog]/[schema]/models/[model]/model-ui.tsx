"use client"

import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function formatTimestamp(value?: number | null) {
  if (!value) {
    return "—"
  }
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatDuration(startMs?: number | null, endMs?: number | null) {
  if (!startMs) {
    return "—"
  }
  const end = endMs ?? Date.now()
  const secs = Math.round((end - startMs) / 1000)
  if (secs < 60) {
    return `${secs}s`
  }
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
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="group/field mt-0.5 flex min-w-0 items-center gap-1.5">
        <p
          className={cn(
            "truncate text-xs",
            mono && "font-mono",
            !value && "text-muted-foreground"
          )}
        >
          {value || "—"}
        </p>
        {copyValue ? (
          <button
            aria-label={`Copy ${label.toLowerCase()}`}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/field:opacity-100"
            onClick={() => {
              navigator.clipboard.writeText(copyValue)
              toast.success("Copied to clipboard")
            }}
            type="button"
          >
            <IconCopy size={12} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>
  }
  const colors: Record<string, string> = {
    FAILED: "bg-destructive/10 text-destructive",
    FINISHED: "bg-green-500/10 text-green-600 dark:text-green-400",
    KILLED: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    RUNNING: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    SCHEDULED: "bg-muted text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
        colors[status] ?? "bg-muted text-muted-foreground"
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
            className="border-b px-4 py-2 text-left font-medium text-muted-foreground"
            key={h}
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
        className="px-5 py-8 text-center text-muted-foreground text-xs"
        colSpan={cols}
      >
        {message}
      </td>
    </tr>
  )
}

export function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="px-5 py-4 text-muted-foreground text-xs" colSpan={cols}>
        Loading…
      </td>
    </tr>
  )
}

export function ErrorRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td
        className="px-5 py-4 font-mono text-destructive text-xs"
        colSpan={cols}
      >
        {message}
      </td>
    </tr>
  )
}
