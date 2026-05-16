"use client"

import { Copy01Icon, PlayIcon, SqlIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Editor from "@monaco-editor/react"
import { useForm } from "@tanstack/react-form"
import type { ColumnDef } from "@tanstack/react-table"
import { useEffect, useMemo, useRef, useState } from "react"
import { DataGrid } from "@/components/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { useDataGrid } from "@/hooks/use-data-grid"
import {
  executeSqlQuery,
  formatQueryResultsAsTsv,
  type QueryResponse,
  type SqlQueryResult,
  sqlSchema,
} from "@/services/sql"

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
    () =>
      queryResult.rows.map((row) =>
        Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]])),
      ),
    [queryResult],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      queryResult.columns.map((col) => ({
        id: col,
        accessorKey: col,
        header: col,
        size: 120,
        minSize: 60,
        meta: { cell: { variant: "short-text" as const } },
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
      <DataGrid
        table={table}
        {...dataGridProps}
        height={height}
        stretchColumns
      />
    </div>
  )
}

// ── SQL editor ────────────────────────────────────────────────────────────────

const RESULTS_MIN = 80
const RESULTS_MAX = 800
const RESULTS_DEFAULT = 300

export function SqlEditor() {
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [resultsHeight, setResultsHeight] = useState(RESULTS_DEFAULT)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: resultsHeight }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      setResultsHeight(
        Math.min(
          RESULTS_MAX,
          Math.max(RESULTS_MIN, dragRef.current.startH + delta),
        ),
      )
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const form = useForm({
    defaultValues: {
      sql: "select * from hdbank.hdbank_payments_prod_bronze.raw_card_payment_events_v1",
    },
    validators: { onSubmit: sqlSchema },
    onSubmit: async ({ value }) => {
      setResult(null)
      setResult(await executeSqlQuery(value.sql))
    },
  })

  const copyResults = () => {
    if (!result?.ok) return
    navigator.clipboard.writeText(formatQueryResultsAsTsv(result.data))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              size="sm"
              disabled={isSubmitting}
              onClick={() => form.handleSubmit()}
              className="gap-1.5 h-7 px-3 text-xs"
            >
              <HugeiconsIcon icon={PlayIcon} size={12} />
              {isSubmitting ? "Running…" : "Run"}
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
          <form.Field name="sql" validators={{ onChange: sqlSchema.shape.sql }}>
            {(field) => (
              <div className="h-full flex flex-col">
                <Editor
                  height="100%"
                  language="sql"
                  theme="vs"
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v ?? "")}
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
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    overviewRulerLanes: 0,
                    renderLineHighlight: "line",
                    padding: { top: 12, bottom: 12 },
                    fontFamily: "var(--font-geist-mono)",
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
      <div
        className="shrink-0 border-t flex flex-col"
        style={{ height: resultsHeight }}
      >
        {/* Resize handle */}
        <button
          type="button"
          aria-label="Resize results pane"
          onMouseDown={handleResizeMouseDown}
          className="h-1 w-full cursor-row-resize hover:bg-primary/30 transition-colors shrink-0"
        />
        {/* Results toolbar */}
        <div className="flex items-center gap-3 px-4 h-9 border-b bg-muted/20 shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Results
          </span>
          {result?.ok && (
            <>
              <span className="text-xs text-muted-foreground">
                {result.data.row_count}{" "}
                {result.data.row_count === 1 ? "row" : "rows"}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {result.elapsed}ms
              </span>
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
