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
    return <div className="p-4 font-mono text-destructive text-sm">{error}</div>
  }
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  const fullPath = `${detail.catalog_name}.${detail.schema_name}.${detail.name}`

  return (
    <VolumeContext value={detail}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b px-5 py-4">
          <div className="mb-0.5 flex items-center gap-2">
            <IconFolder className="text-muted-foreground" size={15} />
            <h2 className="font-semibold text-sm">{detail.name}</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
              {detail.volume_type}
            </span>
          </div>
          <div className="group/path mt-1 flex items-center gap-1.5">
            <p className="font-mono text-muted-foreground text-xs">
              {fullPath}
            </p>
            <button
              className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/path:opacity-100"
              onClick={() => {
                navigator.clipboard.writeText(fullPath)
                toast.success("Copied to clipboard")
              }}
              type="button"
            >
              <IconCopy size={12} />
            </button>
          </div>
          {detail.comment ? (
            <p className="mt-1.5 text-muted-foreground text-xs italic">
              {detail.comment}
            </p>
          ) : null}
        </div>

        {children}
      </div>
    </VolumeContext>
  )
}
