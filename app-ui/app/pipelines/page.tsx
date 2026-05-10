'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid'
import { useDataGrid } from '@/hooks/use-data-grid'

// ── Types ─────────────────────────────────────────────────────────────────────

type Asset = { id: string; path: string[] }
type AssetsResponse = { assets: Asset[]; cursor?: string }
type Row = { name: string; path: string; id: string }

// ── Columns ───────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<Row>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Asset',
    size: 220,
    meta: { cell: { variant: 'short-text' } },
  },
  {
    id: 'path',
    accessorKey: 'path',
    header: 'Path',
    size: 300,
    meta: { cell: { variant: 'short-text' } },
  },
  {
    id: 'id',
    accessorKey: 'id',
    header: 'ID',
    size: 280,
    meta: { cell: { variant: 'short-text' } },
  },
]

// ── Grid ──────────────────────────────────────────────────────────────────────

function AssetsGrid({ rows }: { rows: Row[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(500)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setHeight(entries[0].contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { table, ...dataGridProps } = useDataGrid<Row>({
    data: rows,
    columns: COLUMNS,
    readOnly: true,
  })

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
      <DataGrid table={table} {...dataGridProps} height={height} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dagster/assets')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`)
        return json as AssetsResponse
      })
      .then((data) => setAssets(data.assets ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo<Row[]>(
    () => assets.map((a) => ({
      name: a.path[0] ?? '',
      path: a.path.join(' / '),
      id: a.id,
    })),
    [assets],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 h-12 border-b shrink-0">
        <h1 className="text-sm font-semibold">Pipelines</h1>
        {!loading && !error && (
          <span className="text-xs text-muted-foreground">{assets.length} assets</span>
        )}
      </div>

      {/* Body */}
      {loading && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Loading assets…
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-sm text-destructive font-mono">
          {error}
        </div>
      )}
      {!loading && !error && <AssetsGrid rows={rows} />}
    </div>
  )
}
