'use client'

import Editor from '@monaco-editor/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { MailSend02Icon, DiceFaces04Icon, LiveStreaming01Icon } from '@hugeicons/core-free-icons'

type SendResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status?: number; error: string }

function randomOrderEvent() {
  const countries = ['US', 'DE', 'GB', 'FR', 'JP', 'CA', 'AU', 'BR', 'IN', 'SG']
  const statuses = ['pending', 'completed', 'cancelled', 'refunded']
  return {
    order_id: Math.floor(Math.random() * 1_000_000),
    customer_id: Math.floor(Math.random() * 100_000),
    country_code: countries[Math.floor(Math.random() * countries.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    amount: Math.round(Math.random() * 99900 + 100) / 100,
    timestamp: new Date().toISOString(),
  }
}

const DEFAULT_VALUE = JSON.stringify(randomOrderEvent(), null, 2)

export function StreamingTestEditor() {
  const [value, setValue] = useState(DEFAULT_VALUE)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)

  const handleGenerate = () => {
    setValue(JSON.stringify(randomOrderEvent(), null, 2))
    setResult(null)
  }

  const handleSend = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      setResult({ ok: false, error: 'Invalid JSON — fix the editor before sending.' })
      return
    }

    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/streaming/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        setResult({ ok: true, status: res.status, data: body })
      } else {
        setResult({
          ok: false,
          status: res.status,
          error: (body as { error?: string })?.error ?? `HTTP ${res.status}`,
        })
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        <HugeiconsIcon icon={LiveStreaming01Icon} size={15} className="text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">streaming event</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          className="gap-1.5 h-7 px-3 text-xs"
        >
          <HugeiconsIcon icon={DiceFaces04Icon} size={12} />
          Generate
        </Button>
        <Button
          size="sm"
          disabled={sending}
          onClick={handleSend}
          className="gap-1.5 h-7 px-3 text-xs"
        >
          <HugeiconsIcon icon={MailSend02Icon} size={12} />
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="json"
          theme="vs"
          value={value}
          onChange={(v) => {
            setValue(v ?? '')
            setResult(null)
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            overviewRulerLanes: 0,
            renderLineHighlight: 'line',
            padding: { top: 12, bottom: 12 },
            fontFamily: 'var(--font-geist-mono)',
            lineHeight: 1.6,
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
      </div>

      {/* Response panel */}
      <div className="shrink-0 border-t" style={{ height: 280 }}>
        <div className="flex items-center gap-3 px-4 h-9 border-b bg-muted/20 shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Response
          </span>
          {result && (
            <span
              className={
                result.ok
                  ? 'text-xs text-emerald-600 font-mono'
                  : 'text-xs text-destructive font-mono'
              }
            >
              {result.ok ? `${result.status} Accepted` : result.status ? `${result.status} Error` : 'Error'}
            </span>
          )}
        </div>
        <div className="overflow-auto h-[calc(100%-36px)] px-4 py-3">
          {!result && (
            <span className="text-xs text-muted-foreground">Send an event to see the response</span>
          )}
          {result && (
            <pre
              className={`text-xs font-mono whitespace-pre-wrap ${result.ok ? 'text-foreground' : 'text-destructive'}`}
            >
              {result.ok
                ? JSON.stringify(result.data, null, 2)
                : result.error}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
