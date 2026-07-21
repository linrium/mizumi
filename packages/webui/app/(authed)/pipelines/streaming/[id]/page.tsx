"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status"
import { apiFetch as fetchWithAuth } from "@/lib/api-client"
import { cn } from "@/lib/utils"

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
  if (!ts) {
    return "—"
  }
  return new Date(ts).toLocaleString()
}

type StateVariant = "success" | "warning" | "error" | "default"

const STATE_CONFIG: Record<string, { label: string; variant: StateVariant }> = {
  COMPLETED: { label: "Completed", variant: "default" },
  FAILED: { label: "Failed", variant: "error" },
  PENDING: { label: "Pending", variant: "warning" },
  RUNNING: { label: "Running", variant: "success" },
  SUBMITTED: { label: "Submitted", variant: "warning" },
  UNKNOWN: { label: "Unknown", variant: "default" },
}

const ACTIVE_STATES = new Set(["RUNNING", "SUBMITTED", "PENDING"])

function K8sStateBadge({ state }: { state: string | null | undefined }) {
  if (!state) {
    return <span className="text-muted-foreground">—</span>
  }
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
      className={cn(
        "whitespace-nowrap rounded border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        stage === "confirming" ? "bg-muted" : "hover:bg-muted",
        className
      )}
      disabled={stage === "pending"}
      onBlur={() => {
        if (stage === "confirming") {
          setStage("idle")
        }
      }}
      onClick={handleClick}
      type="button"
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
        const jobRes = await fetchWithAuth(`/api/streaming/jobs/${id}`, {
          cache: "no-store",
        })
        if (!jobRes.ok) {
          const json = await jobRes.json().catch(() => ({}))
          throw new Error(json.error ?? `HTTP ${jobRes.status}`)
        }
        const jobData = (await jobRes.json()) as StreamingJobDetail

        const logsRes = await fetchWithAuth(`/api/streaming/jobs/${id}/logs`, {
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
          timerRef.current = setTimeout(fetchAll, active ? 5000 : 30_000)
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
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [id])

  return { error, job, loading, logs, logsError }
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
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono">{children}</span>
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
    const res = await fetchWithAuth(`/api/streaming/jobs/${id}/restart`, {
      method: "POST",
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error ?? `HTTP ${res.status}`)
    }
    toast.success("Job restarted", { description: job?.name })
  }

  async function doDelete() {
    const res = await fetchWithAuth(`/api/streaming/jobs/${id}`, {
      method: "DELETE",
    })
    if (res.status !== 204 && !res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? `HTTP ${res.status}`)
    }
    toast.success("Job deleted", { description: job?.name })
    router.push("/pipelines/streaming")
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Loading job…
      </div>
    )
  }
  if (error || !job) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-destructive text-sm">
        {error ?? "Job not found"}
      </div>
    )
  }

  const sparkConfEntries = Object.entries(job.spark_conf ?? {})

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <Link
          className="text-muted-foreground text-xs transition-colors hover:text-foreground"
          href="/pipelines/streaming"
        >
          Streaming
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="font-mono font-semibold text-xs">{job.name}</span>
        <K8sStateBadge state={job.k8s_status?.state} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ConfirmButton
            confirmLabel="Confirm restart"
            label="Restart"
            onConfirm={async () => {
              try {
                await doRestart()
              } catch (err) {
                toast.error("Failed to restart", {
                  description: (err as Error).message,
                })
              }
            }}
            pendingLabel="Restarting…"
          />
          <ConfirmButton
            className="text-destructive"
            confirmLabel="Confirm delete"
            label="Delete"
            onConfirm={async () => {
              try {
                await doDelete()
              } catch (err) {
                toast.error("Failed to delete", {
                  description: (err as Error).message,
                })
              }
            }}
            pendingLabel="Deleting…"
          />
        </div>
      </div>

      {/* Main split */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: logs */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
            <span className="font-semibold text-xs">Logs</span>
            {logs?.pod && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {logs.pod}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {logsError ? (
              <p className="font-mono text-muted-foreground text-xs">
                {logsError}
              </p>
            ) : logs?.logs ? (
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-foreground leading-relaxed">
                {logs.logs}
              </pre>
            ) : (
              <p className="text-muted-foreground text-xs">No logs available</p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-64 shrink-0 overflow-y-auto border-l">
          <div className="flex flex-col">
            {/* Status */}
            <div className="px-4 py-4">
              <p className="mb-2 font-semibold text-xs">Status</p>
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
                    <span className="shrink-0 text-muted-foreground">
                      Spark UI
                    </span>
                    <a
                      className="truncate font-mono text-blue-500 hover:underline"
                      href={`http://${job.k8s_status.spark_ui_url}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {job.k8s_status.spark_ui_url}
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Job details */}
            <div className="px-4 py-4">
              <p className="mb-2 font-semibold text-xs">Details</p>
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
            <div className="px-4 py-4">
              <p className="mb-1 font-semibold text-xs">Image</p>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                {job.image}
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* App file */}
            <div className="px-4 py-4">
              <p className="mb-1 font-semibold text-xs">Main File</p>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                {job.main_application_file}
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Resources */}
            <div className="px-4 py-4">
              <p className="mb-2 font-semibold text-xs">Resources</p>
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
                <div className="px-4 py-4">
                  <p className="mb-2 font-semibold text-xs">Spark Config</p>
                  <div className="flex flex-col gap-1.5">
                    {sparkConfEntries.map(([k, v]) => (
                      <div
                        className="break-all rounded bg-muted px-2 py-1 font-mono text-[10px]"
                        key={k}
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
