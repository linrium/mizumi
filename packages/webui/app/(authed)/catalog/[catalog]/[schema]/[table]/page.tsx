'use client'

import { cn } from '@/lib/utils'
import { useTableDetail } from './table-context'

export default function TableSchemaPage() {
  const detail = useTableDetail()

  if (!detail) return null

  return (
    <div className="flex-1 overflow-auto">
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
  )
}
