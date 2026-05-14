"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { toast } from "sonner"

// ── Types ─────────────────────────────────────────────────────────────────────

type K8sStatus = {
  state: string
  driver_pod: string | null
  spark_ui_url: string | null
}

type StreamingJob = {
  id: string
  name: string
  namespace: string
  image: string
  main_application_file: string
  spark_version: string
  spark_conf: Record<string, string>
  driver_cores: number
  driver_memory: string
  executor_instances: number
  executor_cores: number
  executor_memory: string
  created_at: string
  updated_at: string
}

type StreamingJobDetail = StreamingJob & {
  k8s_status: K8sStatus | null
}

type LogsResponse = {
  pod: string
  logs: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

type StateVariant = "success" | "warning" | "error" | "default"

const STATE_CONFIG: Record<string, { label: string; variant: StateVariant }> = {
  RUNNING: { label: "Running", variant: "success" },
  COMPLETED: { label: "Completed", variant: "default" },
  FAILED: { label: "Failed", variant: "error" },
  SUBMITTED: { label: "Submitted", variant: "warning" },
  PENDING: { label: "Pending", variant: "warning" },
  UNKNOWN: { label: "Unknown", variant: "default" },
}

const ACTIVE_STATES = new Set(["RUNNING", "SUBMITTED", "PENDING"])

function K8sStateBadge({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-muted-foreground">—</span>
  const cfg = STATE_CONFIG[state] ?? {
    label: state,
    variant: "default" as StateVariant,
  }
  return (
    <Status variant={cfg.variant}>
      <StatusIndicator />
      <StatusLabel>{cfg.label}</StatusLabel>
    </Status>
  )
}

// ── Confirm button ────────────────────────────────────────────────────────────

function ConfirmButton({
  label,
  confirmLabel,
  pendingLabel,
  className,
  onConfirm,
}: {
  label: string
  confirmLabel: string
  pendingLabel: string
  className?: string
  onConfirm: () => Promise<void>
}) {
  const [stage, setStage] = useState<"idle" | "confirming" | "pending">("idle")

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (stage === "idle") {
      setStage("confirming")
      return
    }
    if (stage === "confirming") {
      setStage("pending")
      onConfirm().finally(() => setStage("idle"))
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={() => {
        if (stage === "confirming") setStage("idle")
      }}
      disabled={stage === "pending"}
      className={cn(
        "text-xs px-3 py-1 border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        stage === "confirming" ? "bg-muted" : "hover:bg-muted",
        className,
      )}
    >
      {stage === "pending"
        ? pendingLabel
        : stage === "confirming"
          ? confirmLabel
          : label}
    </button>
  )
}

// ── Polling hook ──────────────────────────────────────────────────────────────

function useJobDetail(id: string) {
  const [job, setJob] = useState<StreamingJobDetail | null>(null)
  const [logs, setLogs] = useState<LogsResponse | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      try {
        const jobRes = await fetch(`/api/streaming/jobs/${id}`, {
          cache: "no-store",
        })
        if (!jobRes.ok) {
          const json = await jobRes.json().catch(() => ({}))
          throw new Error(json.error ?? `HTTP ${jobRes.status}`)
        }
        const jobData = (await jobRes.json()) as StreamingJobDetail

        const logsRes = await fetch(`/api/streaming/jobs/${id}/logs`, {
          cache: "no-store",
        })
        let logsData: LogsResponse | null = null
        let logsErr: string | null = null
        if (logsRes.ok) {
          logsData = (await logsRes.json()) as LogsResponse
        } else {
          const json = await logsRes.json().catch(() => ({}))
          logsErr = json.error ?? `HTTP ${logsRes.status}`
        }

        if (!cancelled) {
          setJob(jobData)
          setLogs(logsData)
          setLogsError(logsErr)
          setLoading(false)
          const active =
            jobData.k8s_status?.state &&
            ACTIVE_STATES.has(jobData.k8s_status.state)
          timerRef.current = setTimeout(fetchAll, active ? 5000 : 30000)
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setLoading(false)
        }
      }
    }

    fetchAll()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [id])

  return { job, logs, logsError, loading, error }
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-mono truncate">{children}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StreamingJobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id =
    typeof params.id === "string" ? params.id : (params.id as string[])[0]

  const { job, logs, logsError, loading, error } = useJobDetail(id)

  async function doRestart() {
    const res = await fetch(`/api/streaming/jobs/${id}/restart`, {
      method: "POST",
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
    toast.success("Job restarted", { description: job?.name })
  }

  async function doDelete() {
    const res = await fetch(`/api/streaming/jobs/${id}`, { method: "DELETE" })
    if (res.status !== 204 && !res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? `HTTP ${res.status}`)
    }
    toast.success("Job deleted", { description: job?.name })
    router.push("/pipelines/streaming")
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading job…
      </div>
    )
  }
  if (error || !job) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono px-6 text-center">
        {error ?? "Job not found"}
      </div>
    )
  }

  const sparkConfEntries = Object.entries(job.spark_conf ?? {})

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 border-b shrink-0 py-3">
        <Link
          href="/pipelines/streaming"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Streaming
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-xs font-mono font-semibold">{job.name}</span>
        <K8sStateBadge state={job.k8s_status?.state} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ConfirmButton
            label="Restart"
            confirmLabel="Confirm restart"
            pendingLabel="Restarting…"
            onConfirm={async () => {
              try {
                await doRestart()
              } catch (err) {
                toast.error("Failed to restart", {
                  description: (err as Error).message,
                })
              }
            }}
          />
          <ConfirmButton
            label="Delete"
            confirmLabel="Confirm delete"
            pendingLabel="Deleting…"
            className="text-destructive"
            onConfirm={async () => {
              try {
                await doDelete()
              } catch (err) {
                toast.error("Failed to delete", {
                  description: (err as Error).message,
                })
              }
            }}
          />
        </div>
      </div>

      {/* Main split */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: logs */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center px-4 py-2 border-b shrink-0 gap-2">
            <span className="text-xs font-semibold">Logs</span>
            {logs?.pod && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {logs.pod}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto min-h-0 p-4">
            {logsError ? (
              <p className="text-xs text-muted-foreground font-mono">
                {logsError}
              </p>
            ) : logs?.logs ? (
              <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground leading-relaxed">
                {logs.logs}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">No logs available</p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-64 border-l shrink-0 overflow-y-auto">
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Status */}
            <div>
              <p className="text-xs font-semibold mb-2">Status</p>
              <div className="flex flex-col gap-2">
                <DetailRow label="State">
                  {job.k8s_status?.state ?? "—"}
                </DetailRow>
                {job.k8s_status?.driver_pod && (
                  <DetailRow label="Driver Pod">
                    {job.k8s_status.driver_pod}
                  </DetailRow>
                )}
                {job.k8s_status?.spark_ui_url && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">
                      Spark UI
                    </span>
                    <a
                      href={`http://${job.k8s_status.spark_ui_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 hover:underline font-mono truncate"
                    >
                      {job.k8s_status.spark_ui_url}
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Job details */}
            <div>
              <p className="text-xs font-semibold mb-2">Details</p>
              <div className="flex flex-col gap-2">
                <DetailRow label="Namespace">{job.namespace}</DetailRow>
                <DetailRow label="Spark">{job.spark_version}</DetailRow>
                <DetailRow label="Created">
                  {fmtTimestamp(job.created_at)}
                </DetailRow>
                <DetailRow label="Updated">
                  {fmtTimestamp(job.updated_at)}
                </DetailRow>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Image */}
            <div>
              <p className="text-xs font-semibold mb-1">Image</p>
              <p className="text-[10px] font-mono text-muted-foreground break-all">
                {job.image}
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* App file */}
            <div>
              <p className="text-xs font-semibold mb-1">Main File</p>
              <p className="text-[10px] font-mono text-muted-foreground break-all">
                {job.main_application_file}
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Resources */}
            <div>
              <p className="text-xs font-semibold mb-2">Resources</p>
              <div className="flex flex-col gap-2">
                <DetailRow label="Driver Cores">{job.driver_cores}</DetailRow>
                <DetailRow label="Driver Memory">{job.driver_memory}</DetailRow>
                <DetailRow label="Executors">
                  {job.executor_instances}
                </DetailRow>
                <DetailRow label="Exec Cores">{job.executor_cores}</DetailRow>
                <DetailRow label="Exec Memory">{job.executor_memory}</DetailRow>
              </div>
            </div>

            {sparkConfEntries.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <div>
                  <p className="text-xs font-semibold mb-2">Spark Config</p>
                  <div className="flex flex-col gap-1.5">
                    {sparkConfEntries.map(([k, v]) => (
                      <div
                        key={k}
                        className="text-[10px] font-mono bg-muted rounded px-2 py-1 break-all"
                      >
                        <span className="text-muted-foreground">{k}</span>
                        {v ? (
                          <>
                            <br />
                            <span>{v}</span>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
