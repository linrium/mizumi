'use client'

import Editor from '@monaco-editor/react'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const schema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
})

type QueryResponse = {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

type Result =
  | { ok: true; data: QueryResponse }
  | { ok: false; error: string }

export function SqlEditor() {
  const [result, setResult] = useState<Result | null>(null)

  const form = useForm({
    defaultValues: { sql: 'select 1 as ok' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setResult(null)
      try {
        const res = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: value.sql }),
        })
        const body = await res.json()
        if (!res.ok) {
          setResult({ ok: false, error: body.error ?? `HTTP ${res.status}` })
        } else {
          setResult({ ok: true, data: body as QueryResponse })
        }
      } catch (e) {
        setResult({ ok: false, error: (e as Error).message })
      }
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="flex flex-col gap-3"
      >
        <form.Field name="sql" validators={{ onChange: schema.shape.sql }}>
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>SQL Query</Label>
              <div className="overflow-hidden rounded-md border border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                <Editor
                  height="220px"
                  language="sql"
                  theme="vs"
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v ?? '')}
                  onMount={(editor) => {
                    editor.onDidBlurEditorWidget(() => field.handleBlur())
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    overviewRulerLanes: 0,
                    renderLineHighlight: 'line',
                    padding: { top: 8, bottom: 8 },
                  }}
                />
              </div>
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {String(
                    (field.state.meta.errors[0] as { message?: string })
                      ?.message ?? field.state.meta.errors[0],
                  )}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <div className="flex items-center justify-between">
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} size="lg">
                {isSubmitting ? 'Running…' : 'Run'}
              </Button>
            )}
          </form.Subscribe>

          {result?.ok && (
            <span className="text-xs text-muted-foreground">
              {result.data.row_count}{' '}
              {result.data.row_count === 1 ? 'row' : 'rows'}
            </span>
          )}
        </div>
      </form>

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result?.ok && result.data.columns.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {result.data.columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-3 py-2 font-mono text-xs whitespace-nowrap"
                    >
                      {cell === null ? (
                        <span className="text-muted-foreground italic">
                          null
                        </span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
