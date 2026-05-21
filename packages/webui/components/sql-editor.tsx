"use client"

import { Copy01Icon, PlayIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Monaco } from "@monaco-editor/react"
import Editor from "@monaco-editor/react"
import { useForm } from "@tanstack/react-form"
import type { ColumnDef } from "@tanstack/react-table"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import type { CatalogCompletionSchema } from "@/app/api/catalog/completions/route"
import { DataGrid } from "@/components/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { useDataGrid } from "@/hooks/use-data-grid"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  executeSessionSqlQuery,
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

// ── Catalog autocomplete ──────────────────────────────────────────────────────

function tablesInScope(
  sql: string,
  all: CatalogCompletionSchema["tables"],
): CatalogCompletionSchema["tables"] {
  const refs = new Set<string>()
  const re = /(?:FROM|JOIN)\s+([\w.]+)/gi
  let m: RegExpExecArray | null
  m = re.exec(sql)
  while (m !== null) {
    refs.add(m[1].toLowerCase())
    m = re.exec(sql)
  }
  if (refs.size === 0) return all
  return all.filter((t) => {
    const lc = (s: string) => s.toLowerCase()
    return (
      refs.has(lc(`${t.catalog}.${t.schema}.${t.name}`)) ||
      refs.has(lc(`${t.schema}.${t.name}`)) ||
      refs.has(lc(t.name))
    )
  })
}

function buildCompletionProvider(
  monaco: Monaco,
  data: CatalogCompletionSchema,
) {
  const CIK = monaco.languages.CompletionItemKind
  return {
    triggerCharacters: ["."],
    provideCompletionItems(
      model: Parameters<
        Monaco["languages"]["registerCompletionItemProvider"]
      >[1]["provideCompletionItems"] extends (
        m: infer M,
        ...rest: unknown[]
      ) => unknown
        ? M
        : never,
      position: Parameters<
        Monaco["languages"]["registerCompletionItemProvider"]
      >[1]["provideCompletionItems"] extends (
        _m: unknown,
        p: infer P,
        ...rest: unknown[]
      ) => unknown
        ? P
        : never,
      context: { triggerKind: number },
    ) {
      const wordInfo = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: position.column,
      }

      const lineText = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      // Detect dot-chain: e.g. "catalog." or "catalog.schema."
      const chainMatch = lineText.match(/(\w+\.)+(\w*)$/)
      if (chainMatch) {
        const chain = chainMatch[0]
        const parts = chain.split(".").slice(0, -1) // drop trailing empty part

        if (parts.length === 1) {
          // catalog. → suggest schemas
          const schemas = [
            ...new Set(
              data.tables
                .filter((t) => t.catalog === parts[0])
                .map((t) => t.schema),
            ),
          ]
          return {
            suggestions: schemas.map((s) => ({
              label: s,
              kind: CIK.Module,
              insertText: s,
              range,
            })),
          }
        }

        if (parts.length === 2) {
          // catalog.schema. → suggest tables
          const tables = data.tables.filter(
            (t) => t.catalog === parts[0] && t.schema === parts[1],
          )
          return {
            suggestions: tables.map((t) => ({
              label: t.name,
              kind: CIK.Class,
              insertText: t.name,
              range,
              detail: `${t.catalog}.${t.schema}`,
            })),
          }
        }

        return { suggestions: [] }
      }

      // Ctrl+Space explicit invoke — branch on whether cursor is in table or column position
      if (
        context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke
      ) {
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        // Strip the word currently being typed to find what keyword precedes it
        const beforeWord = textBeforeCursor.slice(
          0,
          textBeforeCursor.length - wordInfo.word.length,
        )
        const isTableContext = /\b(FROM|JOIN)\s*$/i.test(beforeWord)

        if (isTableContext) {
          // Suggest catalogs and full FQNs; dot trigger handles the drill-down
          const suggestions: {
            label: string
            kind: number
            insertText: string
            range: typeof range
            detail?: string
          }[] = []
          for (const catalog of data.catalogs) {
            suggestions.push({
              label: catalog,
              kind: CIK.Module,
              insertText: catalog,
              range,
            })
          }
          for (const table of data.tables) {
            const fqn = `${table.catalog}.${table.schema}.${table.name}`
            suggestions.push({
              label: fqn,
              kind: CIK.Class,
              insertText: fqn,
              range,
              detail: "table",
            })
          }
          return { suggestions }
        }

        // Column context: only columns from tables referenced in the query
        const scopedTables = tablesInScope(model.getValue(), data.tables)
        const seen = new Set<string>()
        const suggestions: {
          label: string
          kind: number
          insertText: string
          range: typeof range
          detail: string
        }[] = []
        for (const table of scopedTables) {
          for (const col of table.columns) {
            if (!seen.has(col.name)) {
              seen.add(col.name)
              suggestions.push({
                label: col.name,
                kind: CIK.Field,
                insertText: col.name,
                range,
                detail: col.type,
              })
            }
          }
        }
        return { suggestions }
      }

      // Triggered by typing — suggest catalogs, full table FQNs, and all column names
      const suggestions: {
        label: string
        kind: number
        insertText: string
        range: typeof range
        sortText: string
        detail?: string
      }[] = []

      for (const catalog of data.catalogs) {
        suggestions.push({
          label: catalog,
          kind: CIK.Module,
          insertText: catalog,
          range,
          sortText: `0${catalog}`,
        })
      }

      for (const table of data.tables) {
        const fqn = `${table.catalog}.${table.schema}.${table.name}`
        suggestions.push({
          label: fqn,
          kind: CIK.Class,
          insertText: fqn,
          range,
          sortText: `1${fqn}`,
          detail: "table",
        })
      }

      const scopedTables = tablesInScope(model.getValue(), data.tables)
      const seen = new Set<string>()
      for (const table of scopedTables) {
        for (const col of table.columns) {
          if (!seen.has(col.name)) {
            seen.add(col.name)
            suggestions.push({
              label: col.name,
              kind: CIK.Field,
              insertText: col.name,
              range,
              sortText: `2${col.name}`,
              detail: col.type,
            })
          }
        }
      }

      return { suggestions }
    },
  }
}

// ── SQL editor ────────────────────────────────────────────────────────────────

const RESULTS_MIN = 80
const RESULTS_MAX = 800
const RESULTS_DEFAULT = 300

type SqlCodeEditorProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  className?: string
  editorClassName?: string
  error?: ReactNode
  lineNumbers?: "on" | "off"
}

export function SqlCodeEditor({
  value,
  onChange,
  onSubmit,
  className,
  editorClassName,
  error,
  lineNumbers = "on",
}: SqlCodeEditorProps) {
  const monacoRef = useRef<Monaco | null>(null)
  const completionDataRef = useRef<CatalogCompletionSchema | null>(null)
  const disposeCompletionsRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/catalog/completions")
      .then((r) => r.json())
      .then((data: CatalogCompletionSchema) => {
        if (cancelled) return
        completionDataRef.current = data
        if (monacoRef.current) {
          disposeCompletionsRef.current?.()
          const { dispose } =
            monacoRef.current.languages.registerCompletionItemProvider(
              "sql",
              buildCompletionProvider(monacoRef.current, data),
            )
          disposeCompletionsRef.current = dispose
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      disposeCompletionsRef.current?.()
      disposeCompletionsRef.current = null
    }
  }, [])

  return (
    <div className={cn("h-full flex flex-col", className)}>
      <div className={cn("min-h-0 flex-1", editorClassName)}>
        <Editor
          height="100%"
          language="sql"
          theme="vs"
          value={value}
          onChange={(nextValue) => onChange(nextValue ?? "")}
          onMount={(editor, monaco) => {
            if (onSubmit) {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => onSubmit(),
              )
            }
            monacoRef.current = monaco
            if (completionDataRef.current) {
              disposeCompletionsRef.current?.()
              const { dispose } =
                monaco.languages.registerCompletionItemProvider(
                  "sql",
                  buildCompletionProvider(monaco, completionDataRef.current),
                )
              disposeCompletionsRef.current = dispose
            }
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            overviewRulerLanes: 0,
            renderLineHighlight: "line",
            padding: { top: 12, bottom: 12 },
            fontFamily: "var(--font-geist-mono)",
            lineHeight: 1.6,
          }}
        />
      </div>
      {error ? (
        <div className="px-4 py-1 text-xs text-destructive border-t border-destructive/20 bg-destructive/5">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export function SqlEditor() {
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [resultsHeight, setResultsHeight] = useState(RESULTS_DEFAULT)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
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
      sql: "select * from hdbank.hdbank_partnership_prod_bronze.partner_events_v1 limit 100",
    },
    validators: { onSubmit: sqlSchema },
    onSubmit: async ({ value }) => {
      setResult(null)
      setResult(
        await executeSessionSqlQuery({
          sql: value.sql,
          activeSessionId,
          createSession: async () => {
            const res = await apiFetch("/api/sessions", { method: "POST" })
            if (!res.ok) return null
            const session = (await res.json()) as {
              session_id: string
              pod: string
            }
            setActiveSessionId(session.session_id)
            return session
          },
        }),
      )
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
              <SqlCodeEditor
                value={field.state.value}
                onChange={(nextValue) => field.handleChange(nextValue)}
                onSubmit={() => form.handleSubmit()}
                error={
                  field.state.meta.errors.length > 0
                    ? String(
                        (field.state.meta.errors[0] as { message?: string })
                          ?.message ?? field.state.meta.errors[0],
                      )
                    : undefined
                }
              />
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
