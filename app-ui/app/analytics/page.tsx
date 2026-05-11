'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, getToolName } from 'ai'
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from 'ai'
import ReactECharts from 'echarts-for-react'
import type { ColumnDef } from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import { Chart01Icon, Loading03Icon, ArrowDown01Icon, DatabaseIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'
import { useSessionContext } from '@/hooks/use-session-context'
import { cn } from '@/lib/utils'
import { MODELS } from '@/app/api/analytics/chat/route'
import type { ModelId } from '@/app/api/analytics/chat/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type RunQueryOutput = {
  sql: string
  explanation: string
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  error?: string
}

type VisualizeChartOutput = {
  sql: string
  title: string
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter'
  x: string
  y: string
  explanation: string
  columns?: string[]
  rows?: unknown[][]
  error?: string
}

type QueryResponse = { columns: string[]; rows: unknown[][]; row_count: number }
type Row = Record<string, unknown>

// ── ResultsGrid ───────────────────────────────────────────────────────────────

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

// ── QueryResultCard ───────────────────────────────────────────────────────────

function QueryResultCard({ output }: { output: RunQueryOutput }) {
  const [sqlOpen, setSqlOpen] = useState(false)

  const queryResult: QueryResponse | null =
    output.columns && output.rows
      ? { columns: output.columns, rows: output.rows, row_count: output.row_count ?? output.rows.length }
      : null

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      <button
        type="button"
        onClick={() => setSqlOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:bg-accent/40 transition-colors border-b"
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={11} className={cn('shrink-0 transition-transform', sqlOpen && 'rotate-180')} />
        <HugeiconsIcon icon={DatabaseIcon} size={11} className="shrink-0" />
        <span className="font-mono truncate flex-1 text-left">
          {output.sql.slice(0, 72)}{output.sql.length > 72 ? '…' : ''}
        </span>
        {queryResult && (
          <span className="text-muted-foreground text-[11px] shrink-0">
            {queryResult.row_count} {queryResult.row_count === 1 ? 'row' : 'rows'}
          </span>
        )}
      </button>

      {sqlOpen && (
        <pre className="px-3 py-2 bg-muted/30 whitespace-pre-wrap overflow-x-auto border-b font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 text-destructive font-mono">{output.error}</div>
      )}

      {queryResult && <ResultsGrid queryResult={queryResult} />}
    </div>
  )
}

// ── VisualizationCard ─────────────────────────────────────────────────────────

function buildEChartsOption(
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter',
  keys: string[],
  values: number[],
  title: string,
) {
  if (chartType === 'pie') {
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left', textStyle: { fontSize: 11 } },
      series: [{
        name: title,
        type: 'pie',
        radius: ['35%', '65%'],
        data: keys.map((k, i) => ({ name: k, value: values[i] })),
        label: { fontSize: 11 },
      }],
    }
  }
  if (chartType === 'scatter') {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 16, bottom: 40, containLabel: false },
      xAxis: { type: 'category', data: keys, axisLabel: { fontSize: 11, rotate: keys.length > 6 ? 30 : 0 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
      series: [{ data: values, type: 'scatter', symbolSize: 10 }],
    }
  }
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 16, bottom: 40, containLabel: false },
    xAxis: { type: 'category', data: keys, axisLabel: { fontSize: 11, rotate: keys.length > 6 ? 30 : 0 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
    series: [{
      data: values,
      type: chartType === 'area' ? 'line' : chartType,
      smooth: chartType === 'line' || chartType === 'area',
      areaStyle: chartType === 'area' ? { opacity: 0.18 } : undefined,
    }],
  }
}

function VisualizationCard({ output }: { output: VisualizeChartOutput }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const [tab, setTab] = useState<'chart' | 'data'>('chart')

  const { keys, values } = useMemo(() => {
    if (!output.columns || !output.rows) return { keys: [], values: [] }
    const xi = output.columns.indexOf(output.x)
    const yi = output.columns.indexOf(output.y)
    if (xi === -1 || yi === -1) return { keys: [], values: [] }
    const pairs = output.rows
      .map((r) => ({ k: String(r[xi] ?? ''), v: parseFloat(String(r[yi] ?? '')) }))
      .filter((d) => isFinite(d.v))
    return { keys: pairs.map((d) => d.k), values: pairs.map((d) => d.v) }
  }, [output])

  const option = useMemo(
    () => buildEChartsOption(output.chartType, keys, values, output.title),
    [output.chartType, output.title, keys, values],
  )

  const queryResult: QueryResponse | null = useMemo(() =>
    output.columns && output.rows
      ? { columns: output.columns, rows: output.rows, row_count: output.rows.length }
      : null,
    [output.columns, output.rows],
  )

  return (
    <div className="rounded-lg border overflow-hidden text-xs mt-1">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <HugeiconsIcon icon={Chart01Icon} size={12} className="text-muted-foreground shrink-0" />
        <span className="font-medium flex-1 truncate">{output.title}</span>
        <button
          type="button"
          onClick={() => setSqlOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Toggle SQL"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={11} className={cn('transition-transform', sqlOpen && 'rotate-180')} />
        </button>
      </div>

      {sqlOpen && (
        <pre className="px-3 py-2 bg-muted/30 whitespace-pre-wrap overflow-x-auto border-b font-mono text-[11px]">
          {output.sql}
        </pre>
      )}

      {output.error && (
        <div className="px-3 py-2 text-destructive font-mono">{output.error}</div>
      )}

      {!output.error && (
        <>
          {/* Tab bar */}
          <div className="flex items-center border-b px-1">
            {(['chart', 'data'] as const).map((t) => (
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
                <HugeiconsIcon icon={t === 'chart' ? Chart01Icon : DatabaseIcon} size={11} />
                {t}
              </button>
            ))}
            {queryResult && (
              <>
                <div className="flex-1" />
                <span className="pr-2 text-muted-foreground text-[11px]">
                  {queryResult.row_count} {queryResult.row_count === 1 ? 'row' : 'rows'}
                </span>
              </>
            )}
          </div>

          {tab === 'chart' && (
            keys.length === 0
              ? <div className="py-6 text-center text-muted-foreground">Cannot map &quot;{output.x}&quot; / &quot;{output.y}&quot; to chart axes</div>
              : <ReactECharts option={option} style={{ height: 260 }} opts={{ renderer: 'svg' }} />
          )}

          {tab === 'data' && queryResult && <ResultsGrid queryResult={queryResult} />}
        </>
      )}

      {output.explanation && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">{output.explanation}</p>
      )}
    </div>
  )
}

// ── ToolPart ──────────────────────────────────────────────────────────────────

function ToolPart({ part }: { part: UIMessagePart<UIDataTypes, UITools> }) {
  if (!isToolUIPart(part)) return null

  const name = getToolName(part)

  if (name === 'runQuery') {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      const input = part.input as { explanation?: string } | undefined
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
          {input?.explanation ?? 'Running query…'}
        </div>
      )
    }
    if (part.state === 'output-available') return <QueryResultCard output={part.output as RunQueryOutput} />
    if (part.state === 'output-error') return <ToolError text={part.errorText} />
  }

  if (name === 'visualizeChart') {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      const input = part.input as { title?: string } | undefined
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin shrink-0" />
          {input?.title ? `Charting: ${input.title}` : 'Building chart…'}
        </div>
      )
    }
    if (part.state === 'output-available') return <VisualizationCard output={part.output as VisualizeChartOutput} />
    if (part.state === 'output-error') return <ToolError text={part.errorText} />
  }

  return null
}

function ToolError({ text }: { text: string }) {
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-1">
      {text}
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

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
        if (isToolUIPart(part)) return <ToolPart key={i} part={part} />
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
  'Chart daily revenue by country',
]

export default function AnalyticsPage() {
  const [input, setInput] = useState('')
  const [modelId, setModelId] = useState<ModelId>('gpt-5.4-mini')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  const modelIdRef = useRef<ModelId>(modelId)

  const { sessions, activeId, setActiveId, createSession } = useSessionContext()

  useEffect(() => {
    const id = activeId ?? sessions[0]?.session_id ?? null
    sessionIdRef.current = id
    if (!activeId && sessions[0]) setActiveId(sessions[0].session_id)
  }, [activeId, sessions, setActiveId])

  useEffect(() => { modelIdRef.current = modelId }, [modelId])

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/analytics/chat',
      body: () => ({ sessionId: sessionIdRef.current, modelId: modelIdRef.current }),
    }),
    [],
  )

  const { messages, sendMessage, status } = useChat({ transport })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')

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
          <div className="py-4 space-y-1 max-w-3xl mx-auto w-full">
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}

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
      <div className="shrink-0 py-4">
        <div className="max-w-3xl mx-auto px-4">
          <div className="rounded-2xl border bg-background">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data… (Enter to send, Shift+Enter for new line)"
              rows={2}
              disabled={isLoading}
              className="w-full resize-none text-sm bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50 px-4 pt-3 pb-2"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <Select value={modelId} onValueChange={(v) => setModelId(v as ModelId)}>
                <SelectTrigger className="h-7 w-36 text-xs px-2 gap-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
      </div>
    </div>
  )
}
