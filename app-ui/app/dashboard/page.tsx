'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import ReactECharts from 'echarts-for-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  Edit02Icon,
  DragDropIcon,
  MoreHorizontalIcon,
  BarChartIcon,
  Chart01Icon,
  FloppyDiskIcon,
  PlayIcon,
  Loading03Icon,
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  Refresh01Icon,
  ChartColumnIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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

// ── ECharts option builder ────────────────────────────────────────────────────

function buildOption(chartType: ChartType, result: QueryResult, xCol: string, yCol: string) {
  const xi = result.columns.indexOf(xCol)
  const yi = result.columns.indexOf(yCol)

  const keys = xi >= 0 ? result.rows.map((r) => String(r[xi] ?? '')) : result.rows.map((_, i) => String(i))
  const values = yi >= 0
    ? result.rows.map((r) => parseFloat(String(r[yi] ?? '0'))).filter(isFinite)
    : []

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
      series: [{
        type: 'pie',
        radius: ['32%', '62%'],
        center: ['60%', '50%'],
        data: keys.map((k, i) => ({ name: k, value: values[i] ?? 0 })),
        label: { fontSize: 10, color: textColor },
        itemStyle: { borderRadius: 4 },
      }],
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
    xAxis: {
      type: 'category', data: keys,
      axisLabel: { fontSize: 10, color: textColor, rotate: keys.length > 6 ? 30 : 0 },
      axisLine: { lineStyle: { color: gridColor } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: textColor },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [{
      type: chartType === 'area' ? 'line' : chartType,
      data: values,
      smooth: chartType === 'line' || chartType === 'area',
      areaStyle: chartType === 'area' ? { opacity: 0.18 } : undefined,
      itemStyle: { borderRadius: chartType === 'bar' ? [3, 3, 0, 0] : undefined },
    }],
  }
}

// ── Default panels ────────────────────────────────────────────────────────────

const DEFAULT_PANELS: Panel[] = [
  {
    id: 'p1',
    title: 'Customer Stats',
    chartType: 'bar',
    sql: 'select * from mizumi.default.gold_customer_stats',
    xCol: 'country_code',
    yCol: 'total_spend',
  },
]

const DEFAULT_LAYOUT: Layout = [
  { i: 'p1', x: 0, y: 0, w: 6, h: 4 },
]

// ── Panel card ────────────────────────────────────────────────────────────────

type PanelCardProps = {
  panel: Panel
  data: PanelData
  editing: boolean
  selected: boolean
  onClick: () => void
  onDelete: () => void
}

function PanelCard({ panel, data, editing, selected, onClick, onDelete }: PanelCardProps) {
  const option = useMemo(() => {
    if (data.status === 'ok' && data.result && panel.xCol && panel.yCol) {
      return buildOption(panel.chartType, data.result, panel.xCol, panel.yCol)
    }
    return null
  }, [data, panel.chartType, panel.xCol, panel.yCol])

  return (
    <div
      className={cn(
        'h-full flex flex-col rounded-lg border bg-card overflow-hidden transition-all',
        selected && 'ring-2 ring-primary border-primary',
        editing && !selected && 'border-dashed',
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className={cn(
        'panel-drag-handle flex items-center gap-1.5 px-3 py-2 border-b bg-muted/20 shrink-0 select-none',
        editing && 'cursor-grab active:cursor-grabbing',
      )}>
        {editing && (
          <HugeiconsIcon icon={DragDropIcon} size={12} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium flex-1 truncate">{panel.title}</span>

        {data.status === 'running' && (
          <HugeiconsIcon icon={Loading03Icon} size={12} className="text-muted-foreground animate-spin shrink-0" />
        )}
        {data.status === 'error' && (
          <HugeiconsIcon icon={AlertCircleIcon} size={12} className="text-destructive shrink-0" />
        )}
        {data.status === 'ok' && (
          <span className="text-[10px] text-muted-foreground shrink-0">{data.result?.row_count} rows</span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
              onClick={(e) => e.stopPropagation()}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick() }}>
              <HugeiconsIcon icon={Edit02Icon} size={12} className="mr-2" />
              Configure
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="text-destructive focus:text-destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 p-1">
        {data.status === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <HugeiconsIcon icon={ChartColumnIcon} size={22} />
            <p className="text-[11px]">Click to configure</p>
          </div>
        )}
        {data.status === 'running' && (
          <div className="h-full flex flex-col gap-2 p-2">
            <Skeleton className="h-full w-full" />
          </div>
        )}
        {data.status === 'error' && (
          <div className="h-full flex items-center justify-center p-3">
            <p className="text-[11px] text-destructive text-center whitespace-pre-wrap">{data.error}</p>
          </div>
        )}
        {data.status === 'ok' && option && (
          <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge
          />
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

// ── Preview grid ──────────────────────────────────────────────────────────────

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
    () => result.rows.map((row) =>
      Object.fromEntries(result.columns.map((col, i) => [col, (row as unknown[])[i]])),
    ),
    [result],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () => result.columns.map((col) => ({
      id: col,
      accessorKey: col,
      header: col,
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

// ── Panel config sidebar ──────────────────────────────────────────────────────

type PanelSidebarProps = {
  panel: Panel
  data: PanelData
  sessionId: string | null
  onChange: (updated: Panel) => void
  onRun: (panel: Panel) => void
}

function PanelSidebar({ panel, data, sessionId, onChange, onRun }: PanelSidebarProps) {
  const uid = useId()
  const columns = data.result?.columns ?? []
  const isRunning = data.status === 'running'

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Title */}
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Panel</p>
        <Input
          value={panel.title}
          onChange={(e) => onChange({ ...panel, title: e.target.value })}
          className="h-7 text-xs"
          placeholder="Panel title"
        />
      </div>

      {/* Query */}
      <div className="px-4 py-3 border-b shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">SQL Query</Label>
          <Button
            size="sm"
            className="h-6 gap-1 text-[11px] px-2"
            disabled={isRunning || !sessionId || !panel.sql.trim()}
            onClick={() => onRun(panel)}
          >
            {isRunning
              ? <HugeiconsIcon icon={Loading03Icon} size={11} className="animate-spin" />
              : <HugeiconsIcon icon={PlayIcon} size={11} />
            }
            Run
          </Button>
        </div>
        <Textarea
          id={`${uid}-sql`}
          value={panel.sql}
          onChange={(e) => onChange({ ...panel, sql: e.target.value })}
          placeholder="SELECT col1, col2 FROM table LIMIT 100"
          className="font-mono text-[11px] resize-none min-h-[100px]"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              if (!isRunning && sessionId && panel.sql.trim()) onRun(panel)
            }
          }}
        />
        {!sessionId && (
          <p className="text-[10px] text-destructive">No session — create one to run queries</p>
        )}
        {data.status === 'error' && (
          <p className="text-[10px] text-destructive whitespace-pre-wrap">{data.error}</p>
        )}
        {data.status === 'ok' && (
          <p className="text-[10px] text-muted-foreground">{data.result?.row_count} rows returned</p>
        )}
      </div>

      {/* Chart config */}
      <div className="px-4 py-3 flex flex-col gap-3 shrink-0">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Visualization</Label>

        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-type`} className="text-xs text-muted-foreground">Chart Type</Label>
          <Select value={panel.chartType} onValueChange={(v) => onChange({ ...panel, chartType: v as ChartType })}>
            <SelectTrigger id={`${uid}-type`} className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
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
              <SelectTrigger id={`${uid}-xcol`} className="h-7 text-xs">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${uid}-xcol`}
              value={panel.xCol}
              onChange={(e) => onChange({ ...panel, xCol: e.target.value })}
              placeholder="column name"
              className="h-7 text-xs font-mono"
            />
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-ycol`} className="text-xs text-muted-foreground">Y Column</Label>
          {columns.length > 0 ? (
            <Select value={panel.yCol} onValueChange={(v) => onChange({ ...panel, yCol: v })}>
              <SelectTrigger id={`${uid}-ycol`} className="h-7 text-xs">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${uid}-ycol`}
              value={panel.yCol}
              onChange={(e) => onChange({ ...panel, yCol: e.target.value })}
              placeholder="column name"
              className="h-7 text-xs font-mono"
            />
          )}
        </div>
      </div>

      {/* Result preview */}
      {data.status === 'ok' && data.result && (
        <>
          <Separator />
          <div className="px-4 pt-3 pb-1 shrink-0">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Preview
            </Label>
          </div>
          <div className="flex-1 min-h-0">
            <PreviewGrid result={data.result} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Session picker ────────────────────────────────────────────────────────────

type SessionPickerProps = {
  sessions: ReturnType<typeof useSessions>['sessions']
  activeId: string | null
  creating: boolean
  onSelect: (id: string) => void
  onCreate: () => void
}

function SessionPicker({ sessions, activeId, creating, onSelect, onCreate }: SessionPickerProps) {
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
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        disabled={creating}
        onClick={onCreate}
        title="New session"
      >
        {creating
          ? <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
          : <HugeiconsIcon icon={Add01Icon} size={12} />
        }
      </Button>
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────────

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 288

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
  const dragStateRef = useRef<{ startX: number; startW: number } | null>(null)
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
      const url = sessionId
        ? `/api/sessions/${sessionId}/query`
        : `/api/query`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: panel.sql }),
        signal: ctrl.signal,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`)
      setPanelData((prev) => ({ ...prev, [panel.id]: { status: 'ok', result: json, error: null } }))
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setPanelData((prev) => ({
        ...prev,
        [panel.id]: { status: 'error', result: null, error: (err as Error).message },
      }))
    }
  }, [])

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

  const selectedPanel = panels.find((p) => p.id === selectedId) ?? null
  const selectedData = selectedId ? (panelData[selectedId] ?? { status: 'idle', result: null, error: null }) : null

  const refreshAll = async () => {
    for (const panel of panels) {
      if (panel.sql.trim()) runQuery(panel, activeId)
    }
  }

  const onResizeMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    dragStateRef.current = { startX: e.clientX, startW: sidebarWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragStateRef.current) return
      const delta = dragStateRef.current.startX - ev.clientX
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStateRef.current.startW + delta)))
    }
    const onUp = () => {
      dragStateRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Full-width toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <HugeiconsIcon icon={BarChartIcon} size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Dashboard</span>
        </div>

        <SessionPicker
          sessions={sessions}
          activeId={activeId}
          creating={creating}
          onSelect={setActiveId}
          onCreate={createSession}
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={refreshAll}
            title="Re-run all panels"
          >
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
            {editing ? (
              <>
                <HugeiconsIcon icon={Cancel01Icon} size={13} />
                Done
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Chart01Icon} size={13} />
                Edit Layout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Body: grid + sidebar side by side */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid */}
        <div ref={containerRef} className="flex-1 min-w-0 overflow-auto p-3">
          {panels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <HugeiconsIcon icon={BarChartIcon} size={40} />
              <p className="text-sm">No panels yet. Click <strong>Add Panel</strong> to get started.</p>
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

        {/* Right sidebar */}
        {selectedPanel && selectedData && (
          <div className="flex shrink-0 h-full" style={{ width: sidebarWidth }}>
            {/* Resize handle */}
            <div
              className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors bg-border"
              onMouseDown={onResizeMouseDown}
            />
            <div className="flex flex-col flex-1 min-w-0 overflow-auto border-l bg-background">
              <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
                <span className="text-xs font-semibold">Panel Config</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedId(null)}
                >
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
