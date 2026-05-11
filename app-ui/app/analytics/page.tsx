'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { DynamicToolUIPart, UIMessage } from 'ai'
import { BarChart, LineChart, PieChart } from 'reaviz'
import type { ColumnDef } from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import { Chart01Icon, Loading03Icon, Table01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'
import { useSessions } from '@/hooks/use-sessions'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type Visualization = { type: 'bar' | 'line' | 'pie' | 'table'; x: string; y: string }

type RunQueryOutput = {
  sql: string
  explanation: string
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  visualization?: Visualization
  error?: string
}

type QueryResponse = { columns: string[]; rows: unknown[][]; row_count: number }
type Row = Record<string, unknown>

// ── Shared sub-components ─────────────────────────────────────────────────────

function ResultsGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(220)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setHeight(e[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () => queryResult.rows.map((row) =>
      Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]])),
    ),
    [queryResult],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () => queryResult.columns.map((col) => ({
      id: col,
      accessorKey: col,
      header: col,
      size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
      meta: { cell: { variant: 'short-text' as const } },
    })),
    [queryResult],
  )

  const { table, ...dataGridProps } = useDataGrid<Row>({ data, columns, readOnly: true })

  return (
    <div ref={containerRef} style={{ height: 220 }} className="overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

function ChartView({ queryResult, vis }: { queryResult: QueryResponse; vis: Visualization }) {
  const chartData = useMemo(() => {
    const xi = queryResult.columns.indexOf(vis.x)
    const yi = queryResult.columns.indexOf(vis.y)
    if (xi === -1 || yi === -1) return []
    return queryResult.rows.map((r) => ({ key: String(r[xi] ?? ''), data: Number(r[yi] ?? 0) }))
  }, [queryResult, vis])

  if (chartData.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        Cannot map &quot;{vis.x}&quot; / &quot;{vis.y}&quot; to chart axes
      </div>
    )
  }

  const props = { data: chartData, height: 220 }
  if (vis.type === 'pie') return <div className="flex justify-center py-3"><PieChart {...props} /></div>
  if (vis.type === 'line') return <div className="px-3 py-3"><LineChart {...props} /></div>
  return <div className="px-3 py-3"><BarChart {...props} /></div>
}

// ── Tool result card ──────────────────────────────────────────────────────────

function QueryResultCard({ output }: { output: RunQueryOutput }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const hasVis = output.visualization && output.visualization.type !== 'table'
  const [tab, setTab] = useState<'chart' | 'data'>(hasVis ? 'chart' : 'data')

  const queryResult: QueryResponse | null =
    output.columns && output.rows
      ? { columns: output.columns, rows: output.rows, row_count: output.row_count ?? 0 }
      : null

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      {/* SQL toggle */}
      <button
        type="button"
        onClick={() => setSqlOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:bg-accent/40 transition-colors border-b"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={11}
          className={cn('shrink-0 transition-transform', sqlOpen && 'rotate-180')}
        />
        <span className="font-mono truncate flex-1 text-left">
          {output.sql.slice(0, 72)}{output.sql.length > 72 ? '…' : ''}
        </span>
      </button>

      {sqlOpen && (
        <pre className="px-3 py-2 bg-muted/30 whitespace-pre-wrap overflow-x-auto border-b font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 text-destructive font-mono">{output.error}</div>
      )}

      {queryResult && (
        <>
          {/* Tab bar */}
          <div className="flex items-center border-b px-1">
            {(hasVis ? ['chart', 'data'] as const : ['data'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 font-medium border-b-2 -mb-px capitalize transition-colors',
                  tab === t
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <HugeiconsIcon icon={t === 'chart' ? Chart01Icon : Table01Icon} size={11} />
                {t}
              </button>
            ))}
            <div className="flex-1" />
            <span className="pr-2 text-muted-foreground text-[11px]">
              {queryResult.row_count} {queryResult.row_count === 1 ? 'row' : 'rows'}
            </span>
          </div>

          {tab === 'chart' && output.visualization
            ? <ChartView queryResult={queryResult} vis={output.visualization} />
            : <ResultsGrid queryResult={queryResult} />}
        </>
      )}
    </div>
  )
}

// ── Tool part renderer ────────────────────────────────────────────────────────

function ToolPart({ part }: { part: DynamicToolUIPart }) {
  if (part.toolName !== 'runQuery') return null

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    const input = part.input as { explanation?: string } | undefined
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
        {input?.explanation ?? 'Running query…'}
      </div>
    )
  }

  if (part.state === 'output-available') {
    return <QueryResultCard output={part.output as RunQueryOutput} />
  }

  if (part.state === 'output-error') {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-1">
        Tool error: {part.errorText}
      </div>
    )
  }

  return null
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    const text = message.parts.find((p) => p.type === 'text')?.text ?? ''
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[72%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-1.5 space-y-1.5 max-w-3xl">
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          if (!part.text.trim()) return null
          return (
            <p key={i} className="text-sm whitespace-pre-wrap leading-relaxed">
              {part.text}
            </p>
          )
        }
        if (part.type === 'dynamic-tool') {
          return <ToolPart key={i} part={part} />
        }
        return null
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Revenue by country',
  'Top 5 customers by sales',
  'Show weekly revenue trend',
  'Explain the gold_country_revenue table',
]

export default function AnalyticsPage() {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  const { sessions, activeId, setActiveId, creating, fetchSessions, createSession } = useSessions()

  useEffect(() => { fetchSessions() }, [fetchSessions])

  // Keep ref in sync so the transport closure always reads the latest value
  useEffect(() => {
    const id = activeId ?? sessions[0]?.session_id ?? null
    sessionIdRef.current = id
    if (!activeId && sessions[0]) setActiveId(sessions[0].session_id)
  }, [activeId, sessions, setActiveId])

  // Transport created once; reads sessionIdRef dynamically on each request
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/analytics/chat',
      body: () => ({ sessionId: sessionIdRef.current }),
    }),
    [],
  )

  const { messages, sendMessage, status } = useChat({ transport })

  const isLoading = status === 'submitted' || status === 'streaming'

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')

    // Ensure session exists
    if (!sessionIdRef.current) {
      const s = await createSession()
      sessionIdRef.current = s?.session_id ?? null
    }

    await sendMessage({ text })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const sessionLabel = activeId ?? sessions[0]?.session_id ?? null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Message list ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground px-6">
            <HugeiconsIcon icon={Chart01Icon} size={40} className="opacity-15" />
            <p className="text-sm font-medium">Ask anything about your data</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  className="px-3 py-1 text-xs rounded-full border hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-1">
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}

            {/* Thinking indicator while waiting for the first chunk */}
            {isLoading && messages.at(-1)?.role === 'user' && (
              <div className="flex items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground">
                <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Composer ── */}
      <div className="shrink-0 border-t px-4 py-3 space-y-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your data… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={isLoading}
          className="w-full resize-none text-sm bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {creating && (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                Starting session…
              </>
            )}
            {!creating && sessionLabel && (
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                {sessionLabel.slice(0, 8)}
              </span>
            )}
          </div>
          <Button
            size="sm"
            disabled={isLoading || !input.trim()}
            onClick={handleSend}
            className="h-7 px-3 text-xs"
          >
            {isLoading
              ? <><HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin mr-1.5" />Running</>
              : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
