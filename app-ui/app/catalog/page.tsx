'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CatalogueIcon,
  Copy01Icon,
  Folder01Icon,
  FolderOpenIcon,
  Table01Icon,
  ArrowExpand01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type Catalog = { name: string; comment?: string }
type Schema = { name: string; catalog_name: string; comment?: string }
type TableSummary = { name: string; catalog_name: string; schema_name: string; table_type: string }
type Column = { name: string; type_text: string; nullable: boolean; comment?: string }
type TableDetail = {
  name: string
  catalog_name: string
  schema_name: string
  table_type: string
  data_source_format?: string
  storage_location?: string
  comment?: string
  columns: Column[]
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function apiFetch<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/catalog?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

// ── Tree state ────────────────────────────────────────────────────────────────

type TreeNode =
  | { kind: 'catalog'; catalog: Catalog }
  | { kind: 'schema'; catalog: string; schema: Schema }
  | { kind: 'table'; catalog: string; schema: string; table: TableSummary }

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function TableDetailPanel({ catalog, schema, table }: { catalog: string; schema: string; table: string }) {
  const [detail, setDetail] = useState<TableDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    apiFetch<TableDetail>({ type: 'table', catalog, schema, table })
      .then(setDetail)
      .catch((e) => setError(e.message))
  }, [catalog, schema, table])

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive font-mono">{error}</div>
    )
  }

  if (!detail) {
    return <EmptyState message="Loading…" />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <HugeiconsIcon icon={Table01Icon} size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">{detail.name}</h2>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {detail.table_type}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 group/path">
          <p className="text-xs text-muted-foreground font-mono">
            {detail.catalog_name}.{detail.schema_name}.{detail.name}
          </p>
          <button
            type="button"
            onClick={() => {
                navigator.clipboard.writeText(`${detail.catalog_name}.${detail.schema_name}.${detail.name}`)
                toast.success('Copied to clipboard')
              }}
            className="opacity-0 group-hover/path:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            aria-label="Copy table path"
          >
            <HugeiconsIcon icon={Copy01Icon} size={12} />
          </button>
        </div>
        {detail.comment && (
          <p className="text-xs text-muted-foreground mt-1.5 italic">{detail.comment}</p>
        )}
      </div>

      {/* Meta */}
      {(detail.data_source_format || detail.storage_location) && (
        <div className="px-5 py-3 border-b shrink-0 flex flex-wrap gap-4">
          {detail.data_source_format && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Format</p>
              <p className="text-xs mt-0.5">{detail.data_source_format}</p>
            </div>
          )}
          {detail.storage_location && (
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Location</p>
              <p className="text-xs mt-0.5 font-mono truncate">{detail.storage_location}</p>
            </div>
          )}
        </div>
      )}

      {/* Columns */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">Column</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">Type</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">Nullable</th>
            </tr>
          </thead>
          <tbody>
            {detail.columns.map((col, i) => (
              <tr
                key={col.name}
                className={cn(
                  'border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                )}
              >
                <td className="px-4 py-2 font-mono font-medium">{col.name}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground">{col.type_text}</td>
                <td className="px-4 py-2 text-muted-foreground">{col.nullable ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [schemas, setSchemas] = useState<Record<string, Schema[]>>({})
  const [tables, setTables] = useState<Record<string, TableSummary[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ catalogs: Catalog[] }>({ type: 'catalogs' })
      .then((data) => setCatalogs(data.catalogs ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function expandCatalog(catalog: string) {
    toggle(catalog)
    if (!schemas[catalog]) {
      const data = await apiFetch<{ schemas: Schema[] }>({ type: 'schemas', catalog })
      setSchemas((prev) => ({ ...prev, [catalog]: data.schemas ?? [] }))
    }
  }

  async function expandSchema(catalog: string, schema: string) {
    const key = `${catalog}.${schema}`
    toggle(key)
    if (!tables[key]) {
      const data = await apiFetch<{ tables: TableSummary[] }>({ type: 'tables', catalog, schema })
      setTables((prev) => ({ ...prev, [key]: data.tables ?? [] }))
    }
  }

  const selectedTable =
    selected?.kind === 'table'
      ? { catalog: selected.catalog, schema: selected.schema, table: selected.table.name }
      : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* Tree panel */}
      <div className="w-64 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0">
          <h1 className="text-sm font-semibold">Unity Catalog</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading && <EmptyState message="Loading catalogs…" />}
          {error && <div className="px-4 py-3 text-xs text-destructive">{error}</div>}

          {catalogs.map((cat) => {
            const catExpanded = expanded.has(cat.name)
            return (
              <div key={cat.name}>
                {/* Catalog row */}
                <button
                  type="button"
                  onClick={() => {
                    expandCatalog(cat.name)
                    setSelected({ kind: 'catalog', catalog: cat })
                  }}
                  className={cn(
                    'flex w-full items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left',
                    selected?.kind === 'catalog' && selected.catalog.name === cat.name &&
                      'bg-accent text-accent-foreground font-medium',
                  )}
                >
                  <HugeiconsIcon
                    icon={CatalogueIcon}
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate flex-1">{cat.name}</span>
                  <HugeiconsIcon
                    icon={ArrowExpand01Icon}
                    size={10}
                    className={cn('shrink-0 text-muted-foreground transition-transform', catExpanded && 'rotate-180')}
                  />
                </button>

                {/* Schemas */}
                {catExpanded && (schemas[cat.name] ?? []).map((sch) => {
                  const schKey = `${cat.name}.${sch.name}`
                  const schExpanded = expanded.has(schKey)
                  return (
                    <div key={schKey}>
                      <button
                        type="button"
                        onClick={() => {
                          expandSchema(cat.name, sch.name)
                          setSelected({ kind: 'schema', catalog: cat.name, schema: sch })
                        }}
                        className={cn(
                          'flex w-full items-center gap-1.5 pl-7 pr-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left',
                          selected?.kind === 'schema' &&
                            selected.catalog === cat.name &&
                            selected.schema.name === sch.name &&
                            'bg-accent text-accent-foreground font-medium',
                        )}
                      >
                        <HugeiconsIcon
                          icon={schExpanded ? FolderOpenIcon : Folder01Icon}
                          size={13}
                          className="shrink-0 text-muted-foreground"
                        />
                        <span className="truncate flex-1">{sch.name}</span>
                        <HugeiconsIcon
                          icon={ArrowExpand01Icon}
                          size={10}
                          className={cn('shrink-0 text-muted-foreground transition-transform', schExpanded && 'rotate-180')}
                        />
                      </button>

                      {/* Tables */}
                      {schExpanded && (tables[schKey] ?? []).map((tbl) => (
                        <button
                          key={tbl.name}
                          type="button"
                          onClick={() =>
                            setSelected({ kind: 'table', catalog: cat.name, schema: sch.name, table: tbl })
                          }
                          className={cn(
                            'flex w-full items-center gap-1.5 pl-11 pr-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left',
                            selected?.kind === 'table' &&
                              selected.catalog === cat.name &&
                              selected.schema === sch.name &&
                              selected.table.name === tbl.name &&
                              'bg-accent text-accent-foreground font-medium',
                          )}
                        >
                          <HugeiconsIcon
                            icon={Table01Icon}
                            size={13}
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="truncate">{tbl.name}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {!selected && <EmptyState message="Select a table to view its schema" />}
        {selectedTable && (
          <TableDetailPanel
            key={`${selectedTable.catalog}.${selectedTable.schema}.${selectedTable.table}`}
            {...selectedTable}
          />
        )}
        {selected?.kind === 'catalog' && (
          <div className="p-5">
            <h2 className="text-sm font-semibold mb-1">{selected.catalog.name}</h2>
            {selected.catalog.comment && (
              <p className="text-xs text-muted-foreground">{selected.catalog.comment}</p>
            )}
          </div>
        )}
        {selected?.kind === 'schema' && (
          <div className="p-5">
            <h2 className="text-sm font-semibold mb-1">{selected.schema.name}</h2>
            <p className="text-xs text-muted-foreground">{selected.catalog}.{selected.schema.name}</p>
            {selected.schema.comment && (
              <p className="text-xs text-muted-foreground mt-1">{selected.schema.comment}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
