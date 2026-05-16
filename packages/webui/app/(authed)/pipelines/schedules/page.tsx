"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

dayjs.extend(relativeTime)

// ── Types ─────────────────────────────────────────────────────────────────────

type ScheduleTick = {
  timestamp: number
  status: string
}

type Schedule = {
  name: string
  cron_schedule: string
  description: string | null
  execution_timezone: string | null
  default_status: string | null
  job_name: string | null
  status: string | null
  last_tick: ScheduleTick | null
  next_tick: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(`/api/dagster/${path}`, { cache: "no-store" })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return "—"
  return dayjs(ts * 1000).fromNow()
}

const TICK_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "success" | "error" | "warning" | "default" }
> = {
  SUCCESS: { label: "Success", variant: "success" },
  FAILURE: { label: "Failed", variant: "error" },
  SKIPPED: { label: "Skipped", variant: "warning" },
}

const SCHEDULE_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "success" | "default" }
> = {
  RUNNING: { label: "Running", variant: "success" },
  STOPPED: { label: "Stopped", variant: "default" },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ schedules: Schedule[] }>("schedules")
      .then((d) => setSchedules(d.schedules))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading schedules…
      </div>
    )
  if (error)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">
        {error}
      </div>
    )
  if (schedules.length === 0)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No schedules found
      </div>
    )

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background z-10 border-b">
          <tr className="text-left text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Schedule</th>
            <th className="px-4 py-2.5 font-medium">Timezone</th>
            <th className="px-4 py-2.5 font-medium">Last Tick</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const statusCfg = s.status ? SCHEDULE_STATUS_CONFIG[s.status] : null
            const tickCfg = s.last_tick
              ? TICK_STATUS_CONFIG[s.last_tick.status]
              : null
            return (
              <tr
                key={s.name}
                className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() =>
                  router.push(
                    `/pipelines/schedules/${encodeURIComponent(s.name)}`,
                  )
                }
              >
                <td className="px-4 py-3 font-mono font-medium">{s.name}</td>
                <td className="px-4 py-3">
                  {statusCfg ? (
                    <Status variant={statusCfg.variant}>
                      <StatusIndicator />
                      <StatusLabel>{statusCfg.label}</StatusLabel>
                    </Status>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">
                  {s.cron_schedule}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {s.execution_timezone ?? "UTC"}
                </td>
                <td className="px-4 py-3">
                  {tickCfg ? (
                    <div className="flex items-center gap-2">
                      <Status variant={tickCfg.variant}>
                        <StatusIndicator />
                        <StatusLabel>{tickCfg.label}</StatusLabel>
                      </Status>
                      <span className="text-muted-foreground">
                        {fmtTs(s.last_tick?.timestamp)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                  {s.description ?? "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
