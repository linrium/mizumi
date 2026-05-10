'use client'

import Editor from '@monaco-editor/react'
import { useForm } from '@tanstack/react-form'
import { useState, useRef, useEffect, useMemo } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlayIcon, Copy01Icon, SqlIcon } from '@hugeicons/core-free-icons'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'

const schema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
})

type QueryResponse = {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

type Result =
  | { ok: true; data: QueryResponse; elapsed: number }
  | { ok: false; error: string }

type Row = Record<string, unknown>

// ── Results grid ──────────────────────────────────────────────────────────────

function ResultsGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(264)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setHeight(entries[0].contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () => queryResult.rows.map((row) =>
      Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]]))
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

  const { table, ...dataGridProps } = useDataGrid<Row>({
    data,
    columns,
    readOnly: true,
  })

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

// ── SQL editor ────────────────────────────────────────────────────────────────

export function SqlEditor() {
  const [result, setResult] = useState<Result | null>(null)
  const startRef = useRef<number>(0)

  const form = useForm({
    defaultValues: { sql: 'select * from mizumi.default.gold_country_revenue' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setResult(null)
      startRef.current = Date.now()
      try {
        const res = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: value.sql }),
        })
        const elapsed = Date.now() - startRef.current
        const body = await res.json()
        if (!res.ok) {
          setResult({ ok: false, error: body.error ?? `HTTP ${res.status}` })
        } else {
          setResult({ ok: true, data: body as QueryResponse, elapsed })
        }
      } catch (e) {
        setResult({ ok: false, error: (e as Error).message })
      }
    },
  })

  const copyResults = () => {
    if (!result?.ok) return
    const header = result.data.columns.join('\t')
    const rows = result.data.rows.map((r) => r.map(String).join('\t')).join('\n')
    navigator.clipboard.writeText(`${header}\n${rows}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        <HugeiconsIcon icon={SqlIcon} size={15} className="text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">query.sql</span>
        <div className="flex-1" />
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              size="sm"
              disabled={isSubmitting}
              onClick={() => form.handleSubmit()}
              className="gap-1.5 h-7 px-3 text-xs"
            >
              <HugeiconsIcon icon={PlayIcon} size={12} />
              {isSubmitting ? 'Running…' : 'Run'}
            </Button>
          )}
        </form.Subscribe>
      </div>

      {/* Editor pane */}
      <div className="flex-1 min-h-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="h-full"
        >
          <form.Field name="sql" validators={{ onChange: schema.shape.sql }}>
            {(field) => (
              <div className="h-full flex flex-col">
                <Editor
                  height="100%"
                  language="sql"
                  theme="vs"
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v ?? '')}
                  onMount={(editor, monaco) => {
                    editor.onDidBlurEditorWidget(() => field.handleBlur())
                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                      () => form.handleSubmit(),
                    )
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
                  }}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="px-4 py-1 text-xs text-destructive border-t border-destructive/20 bg-destructive/5">
                    {String(
                      (field.state.meta.errors[0] as { message?: string })
                        ?.message ?? field.state.meta.errors[0],
                    )}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        </form>
      </div>

      {/* Results pane */}
      <div className="h-[300px] shrink-0 border-t flex flex-col">
        {/* Results toolbar */}
        <div className="flex items-center gap-3 px-4 h-9 border-b bg-muted/20 shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Results
          </span>
          {result?.ok && (
            <>
              <span className="text-xs text-muted-foreground">
                {result.data.row_count} {result.data.row_count === 1 ? 'row' : 'rows'}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{result.elapsed}ms</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={copyResults}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <HugeiconsIcon icon={Copy01Icon} size={12} />
                Copy
              </button>
            </>
          )}
          {!result && <div className="flex-1" />}
        </div>

        {/* Results body */}
        {!result && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Run a query to see results
          </div>
        )}

        {result && !result.ok && (
          <div className="flex-1 overflow-auto px-4 py-3 text-sm text-destructive font-mono whitespace-pre-wrap">
            {result.error}
          </div>
        )}

        {result?.ok && result.data.columns.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Query executed successfully — no rows returned
          </div>
        )}

        {result?.ok && result.data.columns.length > 0 && (
          <ResultsGrid key={result.elapsed} queryResult={result.data} />
        )}
      </div>
    </div>
  )
}
