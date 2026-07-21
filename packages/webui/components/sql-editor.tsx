"use client"

import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Monaco } from "@monaco-editor/react"
import Editor from "@monaco-editor/react"
import { IconPlayerPlay } from "@tabler/icons-react"
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
    if (!el) {
      return
    }
    const ro = new ResizeObserver((entries) => {
      setHeight(entries[0].contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo<Row[]>(
    () =>
      queryResult.rows.map((row) =>
        Object.fromEntries(queryResult.columns.map((col, i) => [col, row[i]]))
      ),
    [queryResult]
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      queryResult.columns.map((col) => ({
        accessorKey: col,
        header: col,
        id: col,
        meta: { cell: { variant: "short-text" as const } },
        minSize: 60,
        size: 120,
      })),
    [queryResult]
  )

  const { table, ...dataGridProps } = useDataGrid<Row>({
    columns,
    data,
    readOnly: true,
  })

  return (
    <div className="min-h-0 flex-1 overflow-hidden" ref={containerRef}>
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
  all: CatalogCompletionSchema["tables"]
): CatalogCompletionSchema["tables"] {
  const refs = new Set<string>()
  const re = /(?:FROM|JOIN)\s+([\w.]+)/gi
  let m: RegExpExecArray | null
  m = re.exec(sql)
  while (m !== null) {
    refs.add(m[1].toLowerCase())
    m = re.exec(sql)
  }
  if (refs.size === 0) {
    return all
  }
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
  data: CatalogCompletionSchema
) {
  const CIK = monaco.languages.CompletionItemKind
  return {
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
      context: { triggerKind: number }
    ) {
      const wordInfo = model.getWordUntilPosition(position)
      const range = {
        endColumn: position.column,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        startLineNumber: position.lineNumber,
      }

      const lineText = model.getValueInRange({
        endColumn: position.column,
        endLineNumber: position.lineNumber,
        startColumn: 1,
        startLineNumber: position.lineNumber,
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
                .map((t) => t.schema)
            ),
          ]
          return {
            suggestions: schemas.map((s) => ({
              insertText: s,
              kind: CIK.Module,
              label: s,
              range,
            })),
          }
        }

        if (parts.length === 2) {
          // catalog.schema. → suggest tables
          const tables = data.tables.filter(
            (t) => t.catalog === parts[0] && t.schema === parts[1]
          )
          return {
            suggestions: tables.map((t) => ({
              detail: `${t.catalog}.${t.schema}`,
              insertText: t.name,
              kind: CIK.Class,
              label: t.name,
              range,
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
          endColumn: position.column,
          endLineNumber: position.lineNumber,
          startColumn: 1,
          startLineNumber: 1,
        })
        // Strip the word currently being typed to find what keyword precedes it
        const beforeWord = textBeforeCursor.slice(
          0,
          textBeforeCursor.length - wordInfo.word.length
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
              insertText: catalog,
              kind: CIK.Module,
              label: catalog,
              range,
            })
          }
          for (const table of data.tables) {
            const fqn = `${table.catalog}.${table.schema}.${table.name}`
            suggestions.push({
              detail: "table",
              insertText: fqn,
              kind: CIK.Class,
              label: fqn,
              range,
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
                detail: col.type,
                insertText: col.name,
                kind: CIK.Field,
                label: col.name,
                range,
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
          insertText: catalog,
          kind: CIK.Module,
          label: catalog,
          range,
          sortText: `0${catalog}`,
        })
      }

      for (const table of data.tables) {
        const fqn = `${table.catalog}.${table.schema}.${table.name}`
        suggestions.push({
          detail: "table",
          insertText: fqn,
          kind: CIK.Class,
          label: fqn,
          range,
          sortText: `1${fqn}`,
        })
      }

      const scopedTables = tablesInScope(model.getValue(), data.tables)
      const seen = new Set<string>()
      for (const table of scopedTables) {
        for (const col of table.columns) {
          if (!seen.has(col.name)) {
            seen.add(col.name)
            suggestions.push({
              detail: col.type,
              insertText: col.name,
              kind: CIK.Field,
              label: col.name,
              range,
              sortText: `2${col.name}`,
            })
          }
        }
      }

      return { suggestions }
    },
    triggerCharacters: ["."],
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
  const disposeCompletionsRef = useRef<{ dispose: () => void } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/catalog/completions")
      .then((r) => r.json())
      .then((data: CatalogCompletionSchema) => {
        if (cancelled) {
          return
        }
        completionDataRef.current = data
        if (monacoRef.current) {
          disposeCompletionsRef.current?.dispose()
          disposeCompletionsRef.current =
            monacoRef.current.languages.registerCompletionItemProvider(
              "sql",
              buildCompletionProvider(monacoRef.current, data)
            )
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      disposeCompletionsRef.current?.dispose()
      disposeCompletionsRef.current = null
    }
  }, [])

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className={cn("min-h-0 flex-1", editorClassName)}>
        <Editor
          height="100%"
          language="sql"
          onChange={(nextValue) => onChange(nextValue ?? "")}
          onMount={(editor, monaco) => {
            if (onSubmit) {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => onSubmit()
              )
            }
            monacoRef.current = monaco
            if (completionDataRef.current) {
              disposeCompletionsRef.current?.dispose()
              disposeCompletionsRef.current =
                monaco.languages.registerCompletionItemProvider(
                  "sql",
                  buildCompletionProvider(monaco, completionDataRef.current)
                )
            }
          }}
          options={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 13,
            lineHeight: 1.6,
            lineNumbers,
            minimap: { enabled: false },
            overviewRulerLanes: 0,
            padding: { bottom: 12, top: 12 },
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
          theme="vs"
          value={value}
        />
      </div>
      {error ? (
        <div className="border-destructive/20 border-t bg-destructive/5 px-4 py-1 text-destructive text-xs">
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
    dragRef.current = { startH: resultsHeight, startY: e.clientY }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) {
        return
      }
      const delta = dragRef.current.startY - ev.clientY
      setResultsHeight(
        Math.min(
          RESULTS_MAX,
          Math.max(RESULTS_MIN, dragRef.current.startH + delta)
        )
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
      sql: "select * from hdbank.hdbank_partnership_prod_bronze.customers_v1 limit 100",
    },
    onSubmit: async ({ value }) => {
      setResult(null)
      setResult(
        await executeSessionSqlQuery({
          activeSessionId,
          createSession: async () => {
            const res = await apiFetch("/api/sessions", { method: "POST" })
            if (!res.ok) {
              return null
            }
            const session = (await res.json()) as {
              session_id: string
              pod: string
            }
            setActiveSessionId(session.session_id)
            return session
          },
          sql: value.sql,
        })
      )
    },
    validators: { onSubmit: sqlSchema },
  })

  const copyResults = () => {
    if (!result?.ok) {
      return
    }
    navigator.clipboard.writeText(formatQueryResultsAsTsv(result.data))
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              className="h-7 gap-1.5 px-3 text-xs"
              disabled={isSubmitting}
              onClick={() => form.handleSubmit()}
              size="sm"
            >
              <IconPlayerPlay size={12} />
              {isSubmitting ? "Running…" : "Run"}
            </Button>
          )}
        </form.Subscribe>
      </div>

      {/* Editor pane */}
      <div className="min-h-0 flex-1">
        <form
          className="h-full"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.Field name="sql" validators={{ onChange: sqlSchema.shape.sql }}>
            {(field) => (
              <SqlCodeEditor
                error={
                  field.state.meta.errors.length > 0
                    ? String(
                        (field.state.meta.errors[0] as { message?: string })
                          ?.message ?? field.state.meta.errors[0]
                      )
                    : undefined
                }
                onChange={(nextValue) => field.handleChange(nextValue)}
                onSubmit={() => form.handleSubmit()}
                value={field.state.value}
              />
            )}
          </form.Field>
        </form>
      </div>

      {/* Results pane */}
      <div
        className="flex shrink-0 flex-col border-t"
        style={{ height: resultsHeight }}
      >
        {/* Resize handle */}
        <button
          aria-label="Resize results pane"
          className="h-1 w-full shrink-0 cursor-row-resize transition-colors hover:bg-primary/30"
          onMouseDown={handleResizeMouseDown}
          type="button"
        />
        {/* Results toolbar */}
        <div className="flex h-9 shrink-0 items-center gap-3 border-b bg-muted/20 px-4">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Results
          </span>
          {result?.ok && (
            <>
              <span className="text-muted-foreground text-xs">
                {result.data.row_count}{" "}
                {result.data.row_count === 1 ? "row" : "rows"}
              </span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs">
                {result.elapsed}ms
              </span>
              <div className="flex-1" />
              <button
                className="flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                onClick={copyResults}
                type="button"
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
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Run a query to see results
          </div>
        )}

        {result && !result.ok && (
          <div className="flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-destructive text-sm">
            {result.error}
          </div>
        )}

        {result?.ok && result.data.columns.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
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
