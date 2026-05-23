"use client"

import { IconChevronLeft, IconChevronRight, IconEye, IconFile, IconPhoto } from "@tabler/icons-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { S3Object } from "@/services/catalog-types"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { listVolumeFilesAction } from "../../../../actions"
import { useVolumeDetail } from "./volume-context"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function baseName(key: string): string {
  return key.split("/").pop() ?? key
}

function bucketFromLocation(location: string): string {
  const m = location.match(/^s3:\/\/([^/]+)/)
  return m ? m[1] : ""
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i

export default function VolumeFilesPage() {
  const detail = useVolumeDetail()
  const [objects, setObjects] = useState<S3Object[] | null>(null)
  const [nextToken, setNextToken] = useState<string | undefined>(undefined)
  const [prevTokens, setPrevTokens] = useState<(string | undefined)[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<S3Object | null>(null)

  const storageLocation = detail?.storage_location
  const currentTokenRef = useRef<string | undefined>(undefined)

  const load = useCallback(
    (token: string | undefined) => {
      if (!storageLocation) return
      currentTokenRef.current = token
      setLoading(true)
      setError(null)
      setObjects(null)
      listVolumeFilesAction(storageLocation, token)
        .then(({ objects, nextContinuationToken }) => {
          setObjects(objects)
          setNextToken(nextContinuationToken)
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    },
    [storageLocation],
  )

  useEffect(() => {
    setPrevTokens([])
    currentTokenRef.current = undefined
    load(undefined)
  }, [load])

  if (!detail) return null

  if (!storageLocation) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No storage location configured for this volume.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading files…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive font-mono whitespace-pre-wrap overflow-auto">
        {error}
      </div>
    )
  }

  if (!objects) return null

  const bucket = bucketFromLocation(storageLocation)
  const hasPrev = prevTokens.length > 0
  const hasNext = !!nextToken

  function handleNext() {
    setPrevTokens((prev) => [...prev, currentTokenRef.current])
    load(nextToken)
  }

  function handlePrev() {
    const tokens = [...prevTokens]
    const token = tokens.pop()
    setPrevTokens(tokens)
    load(token)
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-5 py-3 border-b shrink-0 flex flex-wrap gap-6">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Location
            </p>
            <p className="text-xs font-mono mt-0.5">{storageLocation}</p>
          </div>
        </div>

        {objects.length === 0 && !hasPrev ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Volume is empty.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b">
                      Name
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground border-b w-24">
                      Size
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground border-b w-44">
                      Modified
                    </th>
                    <th className="px-4 py-2 border-b w-10" />
                  </tr>
                </thead>
                <tbody>
                  {objects.map((obj, i) => {
                    const name = baseName(obj.key)
                    const isImage = IMAGE_RE.test(name)
                    return (
                      <tr
                        key={obj.key}
                        className={cn(
                          "border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors",
                          i % 2 === 0 ? "bg-background" : "bg-muted/20",
                        )}
                      >
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setSelected(obj)}
                            className="flex items-center gap-2 hover:underline text-left w-full"
                          >
                            {isImage ? (
                              <IconPhoto
                                size={13}
                                className="shrink-0 text-muted-foreground"
                              />
                            ) : (
                              <IconFile
                                size={13}
                                className="shrink-0 text-muted-foreground"
                              />
                            )}
                            <span className="font-mono truncate">{name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {formatBytes(obj.size)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {obj.last_modified ? formatDate(obj.last_modified) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {isImage && (
                            <button
                              type="button"
                              onClick={() => setSelected(obj)}
                              className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Preview"
                            >
                              <IconEye size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 border-t px-4 py-2 flex items-center justify-end gap-1">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={handlePrev}
                className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <IconChevronLeft size={15} />
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={handleNext}
                className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <IconChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <SheetContent className="w-[420px] sm:max-w-[420px] flex flex-col gap-0 p-0 overflow-hidden">
          <SheetHeader className="px-5 py-4 border-b shrink-0">
            <SheetTitle className="text-sm font-semibold truncate">
              {selected ? baseName(selected.key) : ""}
            </SheetTitle>
            <SheetDescription className="sr-only">File preview</SheetDescription>
          </SheetHeader>

          {selected && (
            <div className="flex flex-col flex-1 overflow-auto">
              <div className="flex items-center justify-center bg-muted/40 border-b min-h-64">
                <img
                  src={`/api/files/${bucket}/${selected.key}`}
                  alt={baseName(selected.key)}
                  className="max-w-full max-h-80 object-contain"
                />
              </div>

              <div className="px-5 py-4 space-y-3 text-xs">
                <MetaRow label="Key" value={selected.key} mono />
                <MetaRow label="Size" value={formatBytes(selected.size)} />
                <MetaRow
                  label="Modified"
                  value={selected.last_modified ? formatDate(selected.last_modified) : "—"}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className={cn("break-all", mono && "font-mono")}>{value}</p>
    </div>
  )
}
