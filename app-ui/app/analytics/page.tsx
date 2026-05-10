'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, LineChart, PieChart } from 'reaviz'
import type { ColumnDef } from '@tanstack/react-table'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Chart01Icon,
  Loading03Icon,
  Table01Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'
import { useSessions } from '@/hooks/use-sessions'
import { cn } from '@/lib/utils'
import type { AnalyticsResponse } from '@/app/api/analytics/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type QueryResponse = {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

type Row = Record<string, unknown>

type ViewTab = 'chart' | 'data'

// ── Data grid ─────────────────────────────────────────────────────────────────

function ResultsGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(300)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height))
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
    <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

// ── Chart renderer ────────────────────────────────────────────────────────────

function ChartRenderer({
  queryResult,
  chartConfig,
}: {
  queryResult: QueryResponse
  chartConfig: AnalyticsResponse['chart']
}) {
  const chartData = useMemo(() => {
    const xIdx = queryResult.columns.indexOf(chartConfig.x)
    const yIdx = queryResult.columns.indexOf(chartConfig.y)
    if (xIdx === -1 || yIdx === -1) return []
    return queryResult.rows.map((row) => ({
      key: String(row[xIdx] ?? ''),
      data: Number(row[yIdx] ?? 0),
    }))
  }, [queryResult, chartConfig])

  if (chartData.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Cannot map columns &quot;{chartConfig.x}&quot; / &quot;{chartConfig.y}&quot; to chart data
      </div>
    )
  }

  const commonProps = { data: chartData, height: 320 }

  if (chartConfig.type === 'pie') {
    return (
      <div className="flex justify-center pt-4">
        <PieChart {...commonProps} />
      </div>
    )
  }

  if (chartConfig.type === 'line') {
    return (
      <div className="px-4 pt-4">
        <LineChart {...commonProps} />
      </div>
    )
  }

  // Default: bar
  return (
    <div className="px-4 pt-4">
      <BarChart {...commonProps} />
    </div>
  )
}

// ── SQL disclosure ────────────────────────────────────────────────────────────

function SqlDisclosure({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          className={cn('transition-transform', open && 'rotate-180')}
        />
        Generated SQL
      </button>
      {open && (
        <pre className="px-4 pb-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap overflow-x-auto">
          {sql}
        </pre>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [question, setQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState<AnalyticsResponse | null>(null)
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'ai' | 'query'>('idle')
  const [viewTab, setViewTab] = useState<ViewTab>('chart')
  const [explanation, setExplanation] = useState<string | null>(null)

  const { sessions, activeId, setActiveId, creating, fetchSessions, createSession } = useSessions()

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeId) return activeId
    if (sessions.length > 0) {
      const id = sessions[0].session_id
      setActiveId(id)
      return id
    }
    const s = await createSession()
    return s?.session_id ?? null
  }, [activeId, sessions, setActiveId, createSession])

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || phase !== 'idle') return
    setError(null)
    setAiResponse(null)
    setQueryResult(null)
    setExplanation(null)

    // Step 1: AI generates SQL
    setPhase('ai')
    let ai: AnalyticsResponse
    try {
      const res = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`)
        setPhase('idle')
        return
      }
      ai = body as AnalyticsResponse
      setAiResponse(ai)
      setExplanation(ai.explanation ?? null)
    } catch (e) {
      setError((e as Error).message)
      setPhase('idle')
      return
    }

    // Step 2: Run SQL
    setPhase('query')
    try {
      const sessionId = await ensureSession()
      const url = sessionId ? `/api/sessions/${sessionId}/query` : '/api/query'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: ai.sql }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`)
      } else {
        setQueryResult(body as QueryResponse)
        setViewTab(ai.chart.type === 'table' ? 'data' : 'chart')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPhase('idle')
    }
  }, [question, phase, ensureSession])

  const isLoading = phase !== 'idle'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Results area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Explanation */}
        {explanation && (
          <div className="px-4 py-2 text-xs text-muted-foreground italic border-b shrink-0">
            {explanation}
          </div>
        )}

        {/* SQL disclosure */}
        {aiResponse && <SqlDisclosure sql={aiResponse.sql} />}

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive font-mono whitespace-pre-wrap shrink-0">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !queryResult && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <HugeiconsIcon icon={Chart01Icon} size={36} className="opacity-20" />
            <p className="text-sm">Ask a question to visualize your data</p>
            <p className="text-xs opacity-60">e.g. "Show me revenue by country" or "Top 5 customers by sales"</p>
          </div>
        )}

        {/* Loading placeholder */}
        {isLoading && !queryResult && (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
            {phase === 'ai' ? 'Generating SQL…' : 'Executing query…'}
          </div>
        )}

        {/* Results */}
        {queryResult && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-0 px-4 border-b shrink-0">
              {(['chart', 'data'] as ViewTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setViewTab(tab)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors capitalize',
                    viewTab === tab
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <HugeiconsIcon icon={tab === 'chart' ? Chart01Icon : Table01Icon} size={12} />
                  {tab}
                </button>
              ))}
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {queryResult.row_count} {queryResult.row_count === 1 ? 'row' : 'rows'}
              </span>
            </div>

            {/* Chart view */}
            {viewTab === 'chart' && aiResponse && (
              aiResponse.chart.type === 'table' ? (
                <ResultsGrid queryResult={queryResult} />
              ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                  <ChartRenderer queryResult={queryResult} chartConfig={aiResponse.chart} />
                </div>
              )
            )}

            {/* Data grid view */}
            {viewTab === 'data' && <ResultsGrid queryResult={queryResult} />}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t px-4 py-3 space-y-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
          }}
          placeholder="Ask a question about your data… (⌘+Enter to submit)"
          rows={2}
          className="w-full resize-none text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {creating && (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                Starting session…
              </>
            )}
            {!creating && activeId && (
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                session {activeId.slice(0, 8)}
              </span>
            )}
          </div>
          <Button
            size="sm"
            disabled={isLoading || !question.trim()}
            onClick={handleSubmit}
            className="gap-1.5 h-7 px-3 text-xs"
          >
            {isLoading ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" />
                {phase === 'ai' ? 'Thinking…' : 'Running…'}
              </>
            ) : (
              'Ask AI'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
