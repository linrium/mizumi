'use client'

import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent, type MouseEvent as ReactMouseEvent,
} from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import ReactECharts from 'echarts-for-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai'
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from 'ai'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  Edit02Icon,
  DragDropIcon,
  MoreHorizontalIcon,
  Chart01Icon,
  PlayIcon,
  Loading03Icon,
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  Refresh01Icon,
  ChartColumnIcon,
  SparklesIcon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useSessions } from '@/hooks/use-sessions'
import type { ModelId } from '@/app/api/dashboard/generate/route'
import { MODELS } from '@/app/api/dashboard/generate/route'

import 'react-grid-layout/css/styles.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area'

type QueryResult = {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

type PanelData = {
  status: 'idle' | 'running' | 'ok' | 'error'
  result: QueryResult | null
  error: string | null
}

type Panel = {
  id: string
  title: string
  chartType: ChartType
  sql: string
  xCol: string
  yCol: string
}

// Tool output shape coming back from createPanel
type CreatePanelOutput = {
  title: string
  sql: string
  chartType: ChartType
  xCol: string
  yCol: string
  explanation: string
  width: number
  height: number
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  error?: string
}

// ── ECharts option builder ────────────────────────────────────────────────────

function buildOption(chartType: ChartType, result: QueryResult, xCol: string, yCol: string) {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)
  const keys = xi >= 0 ? result.rows.map((r) => String((r as unknown[])[xi] ?? '')) : result.rows.map((_, i) => String(i))
  const values = yi >= 0 ? result.rows.map((r) => parseFloat(String((r as unknown[])[yi] ?? '0'))).filter(isFinite) : []

  const textColor = '#71717a'
  const gridColor = '#e4e4e7'
  const base = {
    backgroundColor: 'transparent',
    textStyle: { color: textColor, fontFamily: 'inherit' },
    tooltip: { trigger: chartType === 'pie' ? 'item' : 'axis', textStyle: { fontSize: 11 } },
  }

  if (chartType === 'pie') {
    return {
      ...base,
      legend: { orient: 'vertical', left: 'left', textStyle: { fontSize: 11, color: textColor } },
      series: [{ type: 'pie', radius: ['32%', '62%'], center: ['60%', '50%'], data: keys.map((k, i) => ({ name: k, value: values[i] ?? 0 })), label: { fontSize: 10, color: textColor }, itemStyle: { borderRadius: 4 } }],
    }
  }
  if (chartType === 'scatter') {
    return {
      ...base,
      grid: { left: 40, right: 16, top: 12, bottom: 36, containLabel: false },
      xAxis: { type: 'category', data: keys, axisLabel: { fontSize: 10, color: textColor }, axisLine: { lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: gridColor } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: textColor }, splitLine: { lineStyle: { color: gridColor } } },
      series: [{ type: 'scatter', data: values, symbolSize: 10 }],
    }
  }
  return {
    ...base,
    grid: { left: 44, right: 16, top: 12, bottom: 36, containLabel: false },
    xAxis: { type: 'category', data: keys, axisLabel: { fontSize: 10, color: textColor, rotate: keys.length > 6 ? 30 : 0 }, axisLine: { lineStyle: { color: gridColor } }, splitLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: textColor }, splitLine: { lineStyle: { color: gridColor } } },
    series: [{ type: chartType === 'area' ? 'line' : chartType, data: values, smooth: chartType === 'line' || chartType === 'area', areaStyle: chartType === 'area' ? { opacity: 0.18 } : undefined, itemStyle: { borderRadius: chartType === 'bar' ? [3, 3, 0, 0] : undefined } }],
  }
}

// ── Default panel ─────────────────────────────────────────────────────────────

const DEFAULT_PANELS: Panel[] = [{
  id: 'p1', title: 'Customer Stats', chartType: 'bar',
  sql: 'select * from mizumi.default.gold_customer_stats',
  xCol: 'country_code', yCol: 'total_spend',
}]
const DEFAULT_LAYOUT: Layout = [{ i: 'p1', x: 0, y: 0, w: 6, h: 4 }]

// ── PreviewGrid ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function PreviewGrid({ result }: { result: QueryResult }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(200)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setHeight(e[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () => result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, (row as unknown[])[i]]))),
    [result],
  )
  const columns = useMemo<ColumnDef<Row>[]>(
    () => result.columns.map((col) => ({
      id: col, accessorKey: col, header: col,
      size: Math.max(80, Math.ceil(col.length * 7.5 + 48)),
      meta: { cell: { variant: 'short-text' as const } },
    })),
    [result],
  )
  const { table, ...gridProps } = useDataGrid<Row>({ data, columns, readOnly: true })
  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <DataGrid table={table} {...gridProps} height={height} />
    </div>
  )
}

// ── PanelCard ─────────────────────────────────────────────────────────────────

function PanelCard({ panel, data, editing, selected, onClick, onDelete }: {
  panel: Panel; data: PanelData; editing: boolean; selected: boolean
  onClick: () => void; onDelete: () => void
}) {
  const option = useMemo(() => {
    if (data.status === 'ok' && data.result && panel.xCol && panel.yCol)
      return buildOption(panel.chartType, data.result, panel.xCol, panel.yCol)
    return null
  }, [data, panel.chartType, panel.xCol, panel.yCol])

  return (
    <div
      className={cn('h-full flex flex-col rounded-lg border bg-card overflow-hidden transition-all', selected && 'ring-2 ring-primary border-primary', editing && !selected && 'border-dashed')}
      onClick={onClick}
    >
      <div className={cn('panel-drag-handle flex items-center gap-1.5 px-3 py-2 border-b bg-muted/20 shrink-0 select-none', editing && 'cursor-grab active:cursor-grabbing')}>
        {editing && <HugeiconsIcon icon={DragDropIcon} size={12} className="text-muted-foreground shrink-0" />}
        <span className="text-xs font-medium flex-1 truncate">{panel.title}</span>
        {data.status === 'running' && <HugeiconsIcon icon={Loading03Icon} size={12} className="text-muted-foreground animate-spin shrink-0" />}
        {data.status === 'error' && <HugeiconsIcon icon={AlertCircleIcon} size={12} className="text-destructive shrink-0" />}
        {data.status === 'ok' && <span className="text-[10px] text-muted-foreground shrink-0">{data.result?.row_count} rows</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded" onClick={(e) => e.stopPropagation()}>
              <HugeiconsIcon icon={MoreHorizontalIcon} size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick() }}>
              <HugeiconsIcon icon={Edit02Icon} size={12} className="mr-2" />Configure
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-destructive focus:text-destructive">
              <HugeiconsIcon icon={Delete01Icon} size={12} className="mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 min-h-0 p-1">
        {data.status === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <HugeiconsIcon icon={ChartColumnIcon} size={22} />
            <p className="text-[11px]">Click to configure</p>
          </div>
        )}
        {data.status === 'running' && <Skeleton className="h-full w-full" />}
        {data.status === 'error' && (
          <div className="h-full flex items-center justify-center p-3">
            <p className="text-[11px] text-destructive text-center whitespace-pre-wrap">{data.error}</p>
          </div>
        )}
        {data.status === 'ok' && option && (
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} notMerge />
        )}
        {data.status === 'ok' && !option && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <HugeiconsIcon icon={CheckmarkCircle01Icon} size={22} />
            <p className="text-[11px]">{data.result?.row_count} rows — configure X/Y columns</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── PanelSidebar ──────────────────────────────────────────────────────────────

function PanelSidebar({ panel, data, sessionId, onChange, onRun }: {
  panel: Panel; data: PanelData; sessionId: string | null
  onChange: (p: Panel) => void; onRun: (p: Panel) => void
}) {
  const uid = useId()
  const columns = data.result?.columns ?? []
  const isRunning = data.status === 'running'

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Panel</p>
        <Input value={panel.title} onChange={(e) => onChange({ ...panel, title: e.target.value })} className="h-7 text-xs" placeholder="Panel title" />
      </div>
      <div className="px-4 py-3 border-b shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">SQL Query</Label>
          <Button size="sm" className="h-6 gap-1 text-[11px] px-2" disabled={isRunning || !sessionId || !panel.sql.trim()} onClick={() => onRun(panel)}>
            {isRunning ? <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin" /> : <HugeiconsIcon icon={PlayIcon} size={11} />}
            Run
          </Button>
        </div>
        <Textarea
          id={`${uid}-sql`}
          value={panel.sql}
          onChange={(e) => onChange({ ...panel, sql: e.target.value })}
          placeholder="SELECT col1, col2 FROM table LIMIT 100"
          className="font-mono text-[11px] resize-none min-h-[100px]"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!isRunning && sessionId && panel.sql.trim()) onRun(panel) } }}
        />
        {!sessionId && <p className="text-[10px] text-destructive">No session — create one to run queries</p>}
        {data.status === 'error' && <p className="text-[10px] text-destructive whitespace-pre-wrap">{data.error}</p>}
        {data.status === 'ok' && <p className="text-[10px] text-muted-foreground">{data.result?.row_count} rows returned</p>}
      </div>
      <div className="px-4 py-3 flex flex-col gap-3 shrink-0">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Visualization</Label>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-type`} className="text-xs text-muted-foreground">Chart Type</Label>
          <Select value={panel.chartType} onValueChange={(v) => onChange({ ...panel, chartType: v as ChartType })}>
            <SelectTrigger id={`${uid}-type`} className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="area">Area</SelectItem>
              <SelectItem value="pie">Pie / Donut</SelectItem>
              <SelectItem value="scatter">Scatter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-xcol`} className="text-xs text-muted-foreground">X Column</Label>
          {columns.length > 0 ? (
            <Select value={panel.xCol} onValueChange={(v) => onChange({ ...panel, xCol: v })}>
              <SelectTrigger id={`${uid}-xcol`} className="h-7 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
              <SelectContent>{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Input id={`${uid}-xcol`} value={panel.xCol} onChange={(e) => onChange({ ...panel, xCol: e.target.value })} placeholder="column name" className="h-7 text-xs font-mono" />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-ycol`} className="text-xs text-muted-foreground">Y Column</Label>
          {columns.length > 0 ? (
            <Select value={panel.yCol} onValueChange={(v) => onChange({ ...panel, yCol: v })}>
              <SelectTrigger id={`${uid}-ycol`} className="h-7 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
              <SelectContent>{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Input id={`${uid}-ycol`} value={panel.yCol} onChange={(e) => onChange({ ...panel, yCol: e.target.value })} placeholder="column name" className="h-7 text-xs font-mono" />
          )}
        </div>
      </div>
      {data.status === 'ok' && data.result && (
        <>
          <Separator />
          <div className="px-4 pt-3 pb-1 shrink-0">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</Label>
          </div>
          <div className="flex-1 min-h-0">
            <PreviewGrid result={data.result} />
          </div>
        </>
      )}
    </div>
  )
}

// ── SessionPicker ─────────────────────────────────────────────────────────────

function SessionPicker({ sessions, activeId, creating, onSelect, onCreate }: {
  sessions: ReturnType<typeof useSessions>['sessions']
  activeId: string | null; creating: boolean
  onSelect: (id: string) => void; onCreate: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {sessions.length > 0 ? (
        <Select value={activeId ?? ''} onValueChange={onSelect}>
          <SelectTrigger className="h-7 text-xs w-40 gap-1">
            <SelectValue placeholder="No session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.session_id} value={s.session_id}>
                <span className="font-mono">{s.session_id.slice(0, 8)}</span>
                <span className="text-muted-foreground ml-1">· {s.pod}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground">No sessions</span>
      )}
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={creating} onClick={onCreate} title="New session">
        {creating ? <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> : <HugeiconsIcon icon={Add01Icon} size={12} />}
      </Button>
    </div>
  )
}

// ── AI Composer (left sidebar) ────────────────────────────────────────────────

const SUGGESTIONS = [
  'Show revenue by country',
  'Weekly revenue trend',
  'Top customers by spend',
  'Customer growth over time',
]

function AiComposer({ sessionId, modelId, onModelChange, onPanelsCreated }: {
  sessionId: string | null
  modelId: ModelId
  onModelChange: (m: ModelId) => void
  onPanelsCreated: (panels: Panel[], results: Record<string, QueryResult>) => void
}) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef(sessionId)
  const modelIdRef = useRef(modelId)
  const onPanelsCreatedRef = useRef(onPanelsCreated)

  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => { modelIdRef.current = modelId }, [modelId])
  useEffect(() => { onPanelsCreatedRef.current = onPanelsCreated }, [onPanelsCreated])

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/dashboard/generate',
    body: () => ({ sessionId: sessionIdRef.current, modelId: modelIdRef.current }),
  }), [])

  const { messages, sendMessage, status } = useChat({ transport })
  const isLoading = status === 'submitted' || status === 'streaming'

  // When a createPanel tool call lands with output, add it to the dashboard
  useEffect(() => {
    const last = messages.at(-1)
    if (!last || last.role !== 'assistant') return

    const newPanels: Panel[] = []
    const newResults: Record<string, QueryResult> = {}

    for (const part of last.parts) {
      if (!isToolUIPart(part)) continue
      if (getToolName(part) !== 'createPanel') continue
      if (part.state !== 'output-available') continue

      const out = part.output as CreatePanelOutput
      if (out.error) continue
      if (!out.columns || !out.rows) continue

      const id = `ai-${part.toolCallId}`
      newPanels.push({ id, title: out.title, chartType: out.chartType, sql: out.sql, xCol: out.xCol, yCol: out.yCol })
      newResults[id] = { columns: out.columns, rows: out.rows, row_count: out.row_count ?? out.rows.length }
    }

    if (newPanels.length > 0) onPanelsCreatedRef.current(newPanels, newResults)
  // only fire when message list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage({ text })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-3 flex flex-col gap-2">
            <p className="text-[11px] text-muted-foreground">Ask about your data and AI will generate dashboard panels.</p>
            <div className="flex flex-col gap-1.5 mt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  className="text-left text-[11px] px-2.5 py-1.5 rounded border hover:bg-accent transition-colors text-foreground/80"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {messages.map((msg) => <ComposerMessage key={msg.id} message={msg} />)}
            {isLoading && messages.at(-1)?.role === 'user' && (
              <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                Generating panels…
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-2.5 flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about revenue, trends, customers…"
          rows={3}
          className="w-full resize-none text-[11px] rounded-md border bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2">
          <Select value={modelId} onValueChange={(v) => onModelChange(v as ModelId)}>
            <SelectTrigger className="h-7 text-[11px] flex-1 border-0 shadow-none bg-transparent px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs shrink-0"
            disabled={!input.trim() || isLoading}
            onClick={handleSend}
          >
            {isLoading
              ? <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
              : <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
            }
            Generate
          </Button>
        </div>
      </div>
    </div>
  )
}

function ComposerMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    const text = message.parts.find((p) => p.type === 'text')?.text ?? ''
    return (
      <div className="px-3 py-1.5 flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary text-primary-foreground px-3 py-1.5 text-[11px] whitespace-pre-wrap">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-1.5">
      <div className="space-y-1">
        {message.parts.map((part, i) => (
          <ComposerMessagePart key={i} part={part} />
        ))}
      </div>
    </div>
  )
}

function ComposerMessagePart({ part }: { part: UIMessagePart<UIDataTypes, UITools> }) {
  if (part.type === 'text') {
    if (!part.text.trim()) return null
    return <p className="text-[11px] whitespace-pre-wrap leading-relaxed text-foreground/90">{part.text}</p>
  }

  if (isToolUIPart(part) && getToolName(part) === 'createPanel') {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      const input = part.input as { title?: string } | undefined
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-0.5">
          <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin shrink-0" />
          {input?.title ? `Creating: ${input.title}` : 'Creating panel…'}
        </div>
      )
    }
    if (part.state === 'output-available') {
      const out = part.output as CreatePanelOutput
      if (out.error) {
        return (
          <div className="text-[11px] text-destructive py-0.5">
            Failed to create "{out.title}": {out.error}
          </div>
        )
      }
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-0.5">
          <HugeiconsIcon icon={Chart01Icon} size={11} className="text-primary shrink-0" />
          <span>Added <strong className="text-foreground">{out.title}</strong></span>
          <span className="ml-auto">{out.row_count ?? 0} rows</span>
        </div>
      )
    }
  }

  return null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 380
const COMPOSER_MIN = 200
const COMPOSER_MAX = 600
const COMPOSER_DEFAULT = 340

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { width, containerRef, mounted } = useContainerWidth()
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS)
  const [panelData, setPanelData] = useState<Record<string, PanelData>>(() =>
    Object.fromEntries(DEFAULT_PANELS.map((p) => [p.id, { status: 'idle', result: null, error: null }])),
  )
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [composerWidth, setComposerWidth] = useState(COMPOSER_DEFAULT)
  const [modelId, setModelId] = useState<ModelId>('gpt-5.4-mini')
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const composerDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const abortRefs = useRef<Record<string, AbortController>>({})

  const { sessions, activeId, setActiveId, creating, fetchSessions, createSession } = useSessions()
  useEffect(() => { fetchSessions() }, [fetchSessions])

  const runQuery = useCallback(async (panel: Panel, sessionId: string | null) => {
    if (!panel.sql.trim()) return
    abortRefs.current[panel.id]?.abort()
    const ctrl = new AbortController()
    abortRefs.current[panel.id] = ctrl
    setPanelData((prev) => ({ ...prev, [panel.id]: { status: 'running', result: null, error: null } }))
    try {
      const url = sessionId ? `/api/sessions/${sessionId}/query` : `/api/query`
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: panel.sql }), signal: ctrl.signal })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`)
      setPanelData((prev) => ({ ...prev, [panel.id]: { status: 'ok', result: json, error: null } }))
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setPanelData((prev) => ({ ...prev, [panel.id]: { status: 'error', result: null, error: (err as Error).message } }))
    }
  }, [])

  const hasAutoRun = useRef(false)
  useEffect(() => {
    if (!activeId || hasAutoRun.current) return
    hasAutoRun.current = true
    for (const panel of panels) {
      if (panel.sql.trim()) runQuery(panel, activeId)
    }
  // panels intentionally excluded — only run once when activeId first arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, runQuery])

  const handlePanelChange = useCallback((updated: Panel) => {
    setPanels((prev) => prev.map((p) => p.id === updated.id ? updated : p))
  }, [])

  const handleAddPanel = () => {
    const id = `p${Date.now()}`
    const panel: Panel = { id, title: 'New Panel', chartType: 'bar', sql: '', xCol: '', yCol: '' }
    setPanels((prev) => [...prev, panel])
    setPanelData((prev) => ({ ...prev, [id]: { status: 'idle', result: null, error: null } }))
    setLayout((prev) => [...prev, { i: id, x: 0, y: Infinity, w: 6, h: 4 } as LayoutItem])
    setSelectedId(id)
  }

  const handleDeletePanel = (id: string) => {
    abortRefs.current[id]?.abort()
    setPanels((prev) => prev.filter((p) => p.id !== id))
    setPanelData((prev) => { const next = { ...prev }; delete next[id]; return next })
    setLayout((prev) => prev.filter((l) => l.i !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // Called by AiComposer when createPanel tool calls complete
  const handlePanelsCreated = useCallback((newPanels: Panel[], results: Record<string, QueryResult>) => {
    setPanels((prev) => {
      // deduplicate by id — same tool call id shouldn't add twice
      const existingIds = new Set(prev.map((p) => p.id))
      const toAdd = newPanels.filter((p) => !existingIds.has(p.id))
      return [...prev, ...toAdd]
    })
    setPanelData((prev) => {
      const updates: Record<string, PanelData> = {}
      for (const [id, result] of Object.entries(results)) {
        if (!prev[id] || prev[id].status === 'idle') {
          updates[id] = { status: 'ok', result, error: null }
        }
      }
      return { ...prev, ...updates }
    })
    setLayout((prev) => {
      const existingIds = new Set(prev.map((l) => l.i))
      const newItems: LayoutItem[] = newPanels
        .filter((p) => !existingIds.has(p.id))
        .map((p, i) => ({ i: p.id, x: (i % 2) * 6, y: Infinity, w: 6, h: 4 } as LayoutItem))
      return [...prev, ...newItems]
    })
  }, [])

  const refreshAll = () => {
    for (const panel of panels) {
      if (panel.sql.trim()) runQuery(panel, activeId)
    }
  }

  // Resize handlers
  const makeDragHandler = (
    dragRef: typeof sidebarDragRef,
    setWidth: (w: number) => void,
    min: number,
    max: number,
    direction: 'left' | 'right',
  ) => (e: ReactMouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: direction === 'left' ? composerWidth : sidebarWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = direction === 'left'
        ? ev.clientX - dragRef.current.startX
        : dragRef.current.startX - ev.clientX
      setWidth(Math.min(max, Math.max(min, dragRef.current.startW + delta)))
    }
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const selectedPanel = panels.find((p) => p.id === selectedId) ?? null
  const selectedData = selectedId ? (panelData[selectedId] ?? { status: 'idle', result: null, error: null }) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Full-width toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 gap-4">
        <SessionPicker sessions={sessions} activeId={activeId} creating={creating} onSelect={setActiveId} onCreate={createSession} />
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={refreshAll} title="Re-run all panels">
            <HugeiconsIcon icon={Refresh01Icon} size={13} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleAddPanel}>
            <HugeiconsIcon icon={Add01Icon} size={13} />
            Add Panel
          </Button>
          <Button
            variant={editing ? 'default' : 'outline'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => { setEditing((v) => !v); if (editing) setSelectedId(null) }}
          >
            {editing
              ? <><HugeiconsIcon icon={Cancel01Icon} size={13} />Done</>
              : <><HugeiconsIcon icon={Chart01Icon} size={13} />Edit Layout</>
            }
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: AI Composer */}
        <div className="flex shrink-0 h-full" style={{ width: composerWidth }}>
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r bg-background">
            <AiComposer
              sessionId={activeId}
              modelId={modelId}
              onModelChange={setModelId}
              onPanelsCreated={handlePanelsCreated}
            />
          </div>
          {/* Composer resize handle (right edge) */}
          <div
            className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors bg-border"
            onMouseDown={makeDragHandler(composerDragRef, setComposerWidth, COMPOSER_MIN, COMPOSER_MAX, 'left')}
          />
        </div>

        {/* Center: Grid */}
        <div ref={containerRef} className="flex-1 min-w-0 overflow-auto p-3">
          {panels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <HugeiconsIcon icon={SparklesIcon} size={36} className="opacity-20" />
              <p className="text-sm">Ask the AI composer to generate panels, or click <strong>Add Panel</strong>.</p>
            </div>
          ) : mounted ? (
            <ReactGridLayout
              width={width}
              layout={layout}
              gridConfig={{ cols: 12, rowHeight: 60, margin: [8, 8] }}
              dragConfig={{ enabled: editing, handle: '.panel-drag-handle' }}
              resizeConfig={{ enabled: editing, handles: ['se'] }}
              onLayoutChange={setLayout}
            >
              {panels.map((panel) => (
                <div key={panel.id}>
                  <PanelCard
                    panel={panel}
                    data={panelData[panel.id] ?? { status: 'idle', result: null, error: null }}
                    editing={editing}
                    selected={selectedId === panel.id}
                    onClick={() => setSelectedId((prev) => prev === panel.id ? null : panel.id)}
                    onDelete={() => handleDeletePanel(panel.id)}
                  />
                </div>
              ))}
            </ReactGridLayout>
          ) : null}
        </div>

        {/* Right: Panel config sidebar */}
        {selectedPanel && selectedData && (
          <div className="flex shrink-0 h-full" style={{ width: sidebarWidth }}>
            <div
              className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors bg-border"
              onMouseDown={makeDragHandler(sidebarDragRef, setSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, 'right')}
            />
            <div className="flex flex-col flex-1 min-w-0 overflow-auto border-l bg-background">
              <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
                <span className="text-xs font-semibold">Panel Config</span>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSelectedId(null)}>
                  <HugeiconsIcon icon={Cancel01Icon} size={13} />
                </button>
              </div>
              <PanelSidebar
                panel={selectedPanel}
                data={selectedData}
                sessionId={activeId}
                onChange={handlePanelChange}
                onRun={(p) => runQuery(p, activeId)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
