"use client"

import Editor from "@monaco-editor/react"
import {
  IconArrowsExchange,
  IconBuildingBank,
  IconLoader2,
  IconSend,
} from "@tabler/icons-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"

interface PaginatedResponse<T> {
  data: T[]
  hasMore: boolean
  limit: number
  offset: number
  total: number
}

type SendResult =
  | {
      ok: true
      status: number
      data: {
        sent: number
        accepted: number
        failed: number
        sample: unknown[]
      }
    }
  | { ok: false; status?: number; error: string }

async function fetchBatch<T>(dataset: string, batchSize: number): Promise<T[]> {
  const response = await fetch(
    `/api/synthetic/${dataset}?limit=${batchSize}&random=true`,
    { cache: "no-store" }
  )
  if (!response.ok) {
    throw new Error(`Failed to load ${dataset}`)
  }
  const payload = (await response.json()) as PaginatedResponse<T>
  return payload.data
}

function formatResultBadge(result: SendResult): string {
  if (result.ok) {
    return `${result.status} Accepted`
  }
  return result.status ? `${result.status} Error` : "Error"
}

interface EventPanelProps {
  batchSize?: number
  className?: string
  dataset: string
  endpoint: string
  icon: React.ComponentType<{
    size?: number
    className?: string
    stroke?: number
  }>
  label: string
  normalize?: (item: unknown) => Record<string, unknown>
}

function EventPanel({
  icon: Icon,
  label,
  dataset,
  endpoint,
  normalize = (item) => item as Record<string, unknown>,
  batchSize = 100,
  className = "",
}: EventPanelProps) {
  const [editorValue, setEditorValue] = useState("[]")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)

  const handleSend = async () => {
    setSending(true)
    setResult(null)

    try {
      const raw = await fetchBatch(dataset, batchSize)
      const batch = raw.map(normalize)
      setEditorValue(JSON.stringify(batch, null, 2))

      const response = await apiFetch(endpoint, {
        body: JSON.stringify(batch),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const body = await response.json().catch(() => null)

      if (response.ok) {
        const accepted = Array.isArray(body) ? body.length : batch.length
        setResult({
          data: {
            accepted,
            failed: Math.max(0, batch.length - accepted),
            sample: Array.isArray(body) ? body.slice(0, 5) : [body],
            sent: batch.length,
          },
          ok: true,
          status: response.status,
        })
      } else {
        setResult({
          error: (body as { error?: string } | null)?.error ?? "Request failed",
          ok: false,
          status: response.status,
        })
      }
    } catch (error) {
      setResult({ error: (error as Error).message, ok: false })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 items-center gap-2.5 border-b bg-muted/20 px-4 py-2.5">
        <Icon className="text-muted-foreground" size={15} stroke={1.5} />
        <span className="font-medium text-sm">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            className="h-7 gap-1.5 px-3 text-[11px]"
            disabled={sending}
            onClick={handleSend}
            size="sm"
          >
            {sending ? (
              <IconLoader2 className="animate-spin" size={11} />
            ) : (
              <IconSend size={11} />
            )}
            {sending ? `Sending ${batchSize}…` : `Send ${batchSize}`}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="json"
          onChange={(v) => {
            setEditorValue(v ?? "")
            setResult(null)
          }}
          options={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 12,
            formatOnPaste: true,
            formatOnType: true,
            lineHeight: 1.55,
            lineNumbers: "on",
            minimap: { enabled: false },
            overviewRulerLanes: 0,
            padding: { bottom: 10, top: 10 },
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
          theme="vs"
          value={editorValue}
        />
      </div>

      <div className="h-52 shrink-0 border-t">
        <div className="flex h-8 shrink-0 items-center gap-3 border-b bg-muted/10 px-3">
          <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Response
          </span>
          {result ? (
            <Badge
              className="rounded px-1.5 font-mono text-[10px]"
              variant={result.ok ? "default" : "destructive"}
            >
              {formatResultBadge(result)}
            </Badge>
          ) : null}
        </div>
        <div className="h-[calc(100%-32px)] overflow-auto px-4 py-2">
          {result ? (
            <pre
              className={`whitespace-pre-wrap font-mono text-xs ${
                result.ok ? "text-foreground" : "text-destructive"
              }`}
            >
              {result.ok ? JSON.stringify(result.data, null, 2) : result.error}
            </pre>
          ) : (
            <span className="text-muted-foreground text-xs">
              Send {batchSize} events to see the batch response.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function HdbankPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <IconBuildingBank
          className="text-muted-foreground"
          size={15}
          stroke={1.5}
        />
        <div className="min-w-0">
          <div className="font-medium text-sm">HDBank Events</div>
          <div className="text-muted-foreground text-xs">
            Banking transactions are fetched from the synthetic server and sent
            to the batch API.
          </div>
        </div>
      </div>

      <EventPanel
        className="flex-1"
        dataset="banking-transactions"
        endpoint="/api/tests/hdbank/banking-transactions/batch"
        icon={IconArrowsExchange}
        label="Banking Transaction Events"
      />
    </div>
  )
}
