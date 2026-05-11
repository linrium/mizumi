'use client'

import { useId, useMemo, useState } from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import ReactECharts from 'echarts-for-react'
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
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import 'react-grid-layout/css/styles.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area'

type Panel = {
  id: string
  title: string
  chartType: ChartType
  dataKey: string
}

// ── Sample datasets ───────────────────────────────────────────────────────────

const DATASETS: Record<string, { label: string; keys: string[]; values: number[] }> = {
  daily_orders: {
    label: 'Daily Orders',
    keys: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [142, 198, 165, 234, 287, 312, 175],
  },
  country_revenue: {
    label: 'Revenue by Country',
    keys: ['USA', 'UK', 'Germany', 'Japan', 'France', 'Canada', 'Australia'],
    values: [4820, 2310, 1980, 1750, 1340, 980, 860],
  },
  monthly_growth: {
    label: 'Monthly Growth %',
    keys: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    values: [2.1, 3.4, 1.8, 5.2, 4.7, 6.1],
  },
  customer_segments: {
    label: 'Customer Segments',
    keys: ['Enterprise', 'Mid-Market', 'SMB', 'Startup', 'Individual'],
    values: [35, 28, 19, 12, 6],
  },
  bronze_silver_gold: {
    label: 'Lakehouse Layers',
    keys: ['Bronze', 'Silver', 'Gold'],
    values: [12480, 7320, 3140],
  },
}

// ── ECharts option builder ────────────────────────────────────────────────────

function buildOption(chartType: ChartType, dataKey: string) {
  const ds = DATASETS[dataKey]
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
        data: ds.keys.map((k, i) => ({ name: k, value: ds.values[i] })),
        label: { fontSize: 10, color: textColor },
        itemStyle: { borderRadius: 4 },
      }],
    }
  }

  if (chartType === 'scatter') {
    return {
      ...base,
      grid: { left: 40, right: 16, top: 12, bottom: 36, containLabel: false },
      xAxis: { type: 'category', data: ds.keys, axisLabel: { fontSize: 10, color: textColor }, axisLine: { lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: gridColor } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: textColor }, splitLine: { lineStyle: { color: gridColor } } },
      series: [{ type: 'scatter', data: ds.values, symbolSize: 10 }],
    }
  }

  return {
    ...base,
    grid: { left: 44, right: 16, top: 12, bottom: 36, containLabel: false },
    xAxis: {
      type: 'category', data: ds.keys,
      axisLabel: { fontSize: 10, color: textColor, rotate: ds.keys.length > 6 ? 30 : 0 },
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
      data: ds.values,
      smooth: chartType === 'line' || chartType === 'area',
      areaStyle: chartType === 'area' ? { opacity: 0.18 } : undefined,
      itemStyle: { borderRadius: chartType === 'bar' ? [3, 3, 0, 0] : undefined },
    }],
  }
}

// ── Default panels ────────────────────────────────────────────────────────────

const DEFAULT_PANELS: Panel[] = [
  { id: 'p1', title: 'Daily Orders', chartType: 'bar', dataKey: 'daily_orders' },
  { id: 'p2', title: 'Revenue by Country', chartType: 'pie', dataKey: 'country_revenue' },
  { id: 'p3', title: 'Monthly Growth', chartType: 'area', dataKey: 'monthly_growth' },
  { id: 'p4', title: 'Customer Segments', chartType: 'pie', dataKey: 'customer_segments' },
  { id: 'p5', title: 'Lakehouse Layers', chartType: 'bar', dataKey: 'bronze_silver_gold' },
]

const DEFAULT_LAYOUT: Layout = [
  { i: 'p1', x: 0, y: 0, w: 6, h: 4 },
  { i: 'p2', x: 6, y: 0, w: 6, h: 4 },
  { i: 'p3', x: 0, y: 4, w: 8, h: 4 },
  { i: 'p4', x: 8, y: 4, w: 4, h: 4 },
  { i: 'p5', x: 0, y: 8, w: 12, h: 4 },
]

// ── Panel editor dialog ───────────────────────────────────────────────────────

type PanelEditorProps = {
  open: boolean
  panel: Panel | null
  onSave: (panel: Panel) => void
  onClose: () => void
}

function PanelEditor({ open, panel, onSave, onClose }: PanelEditorProps) {
  const uid = useId()
  const [title, setTitle] = useState(panel?.title ?? '')
  const [chartType, setChartType] = useState<ChartType>(panel?.chartType ?? 'bar')
  const [dataKey, setDataKey] = useState(panel?.dataKey ?? 'daily_orders')

  const isNew = panel === null

  const syncFromPanel = (p: Panel | null) => {
    if (p) {
      setTitle(p.title)
      setChartType(p.chartType)
      setDataKey(p.dataKey)
    } else {
      setTitle('')
      setChartType('bar')
      setDataKey('daily_orders')
    }
  }

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      id: panel?.id ?? `p${Date.now()}`,
      title: title.trim(),
      chartType,
      dataKey,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
        else syncFromPanel(panel)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Panel' : 'Edit Panel'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-title`}>Title</Label>
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Panel title"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-type`}>Chart Type</Label>
            <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
              <SelectTrigger id={`${uid}-type`}>
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
            <Label htmlFor={`${uid}-data`}>Dataset</Label>
            <Select value={dataKey} onValueChange={setDataKey}>
              <SelectTrigger id={`${uid}-data`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DATASETS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            <HugeiconsIcon icon={FloppyDiskIcon} size={14} />
            {isNew ? 'Add' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Panel card ────────────────────────────────────────────────────────────────

type PanelCardProps = {
  panel: Panel
  editing: boolean
  onEdit: () => void
  onDelete: () => void
}

function PanelCard({ panel, editing, onEdit, onDelete }: PanelCardProps) {
  const option = useMemo(
    () => buildOption(panel.chartType, panel.dataKey),
    [panel.chartType, panel.dataKey],
  )

  return (
    <div className={cn(
      'h-full flex flex-col rounded-lg border bg-card overflow-hidden',
      editing && 'border-primary/50 shadow-sm',
    )}>
      <div className={cn(
        'panel-drag-handle flex items-center gap-1.5 px-3 py-2 border-b bg-muted/20 shrink-0 select-none',
        editing && 'cursor-grab active:cursor-grabbing',
      )}>
        {editing && (
          <HugeiconsIcon icon={DragDropIcon} size={12} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium flex-1 truncate">{panel.title}</span>
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
            <DropdownMenuItem onClick={onEdit}>
              <HugeiconsIcon icon={Edit02Icon} size={12} className="mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <HugeiconsIcon icon={Delete01Icon} size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 min-h-0 p-1">
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
          notMerge
        />
      </div>
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { width, containerRef, mounted } = useContainerWidth()
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS)
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null)

  const openAddPanel = () => {
    setEditingPanel(null)
    setEditorOpen(true)
  }

  const openEditPanel = (panel: Panel) => {
    setEditingPanel(panel)
    setEditorOpen(true)
  }

  const handleSavePanel = (panel: Panel) => {
    if (editingPanel) {
      setPanels((prev) => prev.map((p) => p.id === panel.id ? panel : p))
    } else {
      setPanels((prev) => [...prev, panel])
      setLayout((prev) => [
        ...prev,
        { i: panel.id, x: 0, y: Infinity, w: 6, h: 4 } as LayoutItem,
      ])
    }
  }

  const handleDeletePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id))
    setLayout((prev) => prev.filter((l) => l.i !== id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={BarChartIcon} size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={openAddPanel}>
            <HugeiconsIcon icon={Add01Icon} size={13} />
            Add Panel
          </Button>
          <Button
            variant={editing ? 'default' : 'outline'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setEditing((v) => !v)}
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

      {/* Grid */}
      <div ref={containerRef} className="flex-1 overflow-auto p-3">
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
                  editing={editing}
                  onEdit={() => openEditPanel(panel)}
                  onDelete={() => handleDeletePanel(panel.id)}
                />
              </div>
            ))}
          </ReactGridLayout>
        ) : null}
      </div>

      <PanelEditor
        open={editorOpen}
        panel={editingPanel}
        onSave={handleSavePanel}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
