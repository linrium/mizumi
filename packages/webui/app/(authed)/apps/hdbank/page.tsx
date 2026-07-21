"use client"

import {
  IconArrowsExchange,
  IconBuildingBank,
  IconLoader2,
  IconSend,
} from "@tabler/icons-react"
import Editor from "@monaco-editor/react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"

type PaginatedResponse<T> = {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

type BankingTransaction = {
  transactionId: string
  userId: string
  accountId: string
  postedAt: string
  transactionType: string
  channel: string
  merchantCategory: string
  amount: string
  currency: string
  sourceBank: string
  destinationBank: string
  merchantName: string
  balanceBefore: string
  balanceAfter: string
  city: string
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
  if (!response.ok) throw new Error(`Failed to load ${dataset}`)
  const payload = (await response.json()) as PaginatedResponse<T>
  return payload.data
}

type EventPanelProps = {
  icon: React.ComponentType<{
    size?: number
    className?: string
    stroke?: number
  }>
  label: string
  dataset: string
  endpoint: string
  normalize?: (item: unknown) => Record<string, unknown>
  batchSize?: number
  className?: string
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      })
      const body = await response.json().catch(() => null)

      if (response.ok) {
        const accepted = Array.isArray(body) ? body.length : batch.length
        setResult({
          ok: true,
          status: response.status,
          data: {
            sent: batch.length,
            accepted,
            failed: Math.max(0, batch.length - accepted),
            sample: Array.isArray(body) ? body.slice(0, 5) : [body],
          },
        })
      } else {
        setResult({
          ok: false,
          status: response.status,
          error: (body as { error?: string } | null)?.error ?? "Request failed",
        })
      }
    } catch (error) {
      setResult({ ok: false, error: (error as Error).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 items-center gap-2.5 border-b bg-muted/20 px-4 py-2.5">
        <Icon size={15} className="text-muted-foreground" stroke={1.5} />
        <span className="text-sm font-medium">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            disabled={sending}
            onClick={handleSend}
            className="h-7 gap-1.5 px-3 text-[11px]"
          >
            {sending ? (
              <IconLoader2 size={11} className="animate-spin" />
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
          theme="vs"
          value={editorValue}
          onChange={(v) => {
            setEditorValue(v ?? "")
            setResult(null)
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            overviewRulerLanes: 0,
            renderLineHighlight: "line",
            padding: { top: 10, bottom: 10 },
            fontFamily: "var(--font-geist-mono)",
            lineHeight: 1.55,
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
      </div>

      <div className="h-52 shrink-0 border-t">
        <div className="flex h-8 shrink-0 items-center gap-3 border-b bg-muted/10 px-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Response
          </span>
          {result && (
            <Badge
              variant={result.ok ? "default" : "destructive"}
              className="rounded px-1.5 font-mono text-[10px]"
            >
              {result.ok
                ? `${result.status} Accepted`
                : result.status
                  ? `${result.status} Error`
                  : "Error"}
            </Badge>
          )}
        </div>
        <div className="h-[calc(100%-32px)] overflow-auto px-4 py-2">
          {!result ? (
            <span className="text-xs text-muted-foreground">
              Send {batchSize} events to see the batch response.
            </span>
          ) : (
            <pre
              className={`whitespace-pre-wrap font-mono text-xs ${
                result.ok ? "text-foreground" : "text-destructive"
              }`}
            >
              {result.ok ? JSON.stringify(result.data, null, 2) : result.error}
            </pre>
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
          size={15}
          className="text-muted-foreground"
          stroke={1.5}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium">HDBank Events</div>
          <div className="text-xs text-muted-foreground">
            Banking transactions are fetched from the synthetic server and sent
            to the batch API.
          </div>
        </div>
      </div>

      <EventPanel
        icon={IconArrowsExchange}
        label="Banking Transaction Events"
        dataset="banking-transactions"
        endpoint="/api/tests/hdbank/banking-transactions/batch"
        className="flex-1"
      />
    </div>
  )
}
