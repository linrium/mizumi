"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { DataGrid } from "@/components/data-grid/data-grid"
import { useDataGrid } from "@/hooks/use-data-grid"
import { type QueryResponse, runSqlQuery } from "@/services/sql"

type Row = Record<string, unknown>

function PreviewGrid({ queryResult }: { queryResult: QueryResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height),
    )
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

export default function TablePreviewPage() {
  const { catalog, schema, table } = useParams<{
    catalog: string
    schema: string
    table: string
  }>()
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const key = `${catalog}.${schema}.${table}`
    if (fetchedKeyRef.current === key) return
    fetchedKeyRef.current = key

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setQueryResult(null)
      try {
        const result = await runSqlQuery(
          `SELECT * FROM ${catalog}.${schema}.${table} LIMIT 500`,
        )
        if (!cancelled) setQueryResult(result)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [catalog, schema, table])

  if (loading)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading preview…
      </div>
    )
  if (error)
    return (
      <div className="p-4 text-sm text-destructive font-mono whitespace-pre-wrap">
        {error}
      </div>
    )
  if (!queryResult) return null
  if (queryResult.row_count === 0)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Table is empty
      </div>
    )
  return <PreviewGrid queryResult={queryResult} />
}
