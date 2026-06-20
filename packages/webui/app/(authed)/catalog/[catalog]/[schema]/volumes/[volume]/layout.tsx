"use client"

import { IconCopy, IconFolder } from "@tabler/icons-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { getVolumeAction } from "../../../../actions"
import { VolumeContext, type VolumeDetail } from "./volume-context"

export default function VolumeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { catalog, schema, volume } = useParams<{
    catalog: string
    schema: string
    volume: string
  }>()
  const [detail, setDetail] = useState<VolumeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    getVolumeAction(catalog, schema, volume)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [catalog, schema, volume])

  if (error) {
    return <div className="p-4 text-sm text-destructive font-mono">{error}</div>
  }
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const fullPath = `${detail.catalog_name}.${detail.schema_name}.${detail.name}`

  return (
    <VolumeContext value={detail}>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <IconFolder size={15} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">{detail.name}</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {detail.volume_type}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 group/path">
            <p className="text-xs text-muted-foreground font-mono">
              {fullPath}
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fullPath)
                toast.success("Copied to clipboard")
              }}
              className="opacity-0 group-hover/path:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            >
              <IconCopy size={12} />
            </button>
          </div>
          {detail.comment && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              {detail.comment}
            </p>
          )}
        </div>

        {children}
      </div>
    </VolumeContext>
  )
}
