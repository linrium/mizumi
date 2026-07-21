"use client"

import {
  IconBrain,
  IconLoader2,
  IconPhotoScan,
  IconUpload,
} from "@tabler/icons-react"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Prediction = {
  label: string
  score: number
  rankings: Array<{ label: string; score: number }>
  model_uri: string
  metadata: {
    run_ts?: string
    clip_model_id?: string
    training_samples?: number
    train_accuracy?: number
    classes?: string[]
  }
}

export default function VietjetairBaggageModelPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const topScore = useMemo(() => {
    if (!prediction) return null
    return `${Math.round(prediction.score * 1000) / 10}%`
  }, [prediction])

  async function submit() {
    if (!file) return

    setLoading(true)
    setError(null)
    setPrediction(null)

    const form = new FormData()
    form.set("file", file)

    try {
      const response = await fetch("/api/models/baggage-damage/predict", {
        method: "POST",
        body: form,
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          (body as { detail?: string } | null)?.detail ?? "Prediction failed"
        )
      }
      setPrediction(body as Prediction)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <IconPhotoScan
          size={15}
          className="text-muted-foreground"
          stroke={1.5}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium">Baggage Damage Model</div>
          <div className="truncate text-xs text-muted-foreground">
            VietJet Air image classifier
          </div>
        </div>
        <Badge
          variant="outline"
          className="ml-auto rounded px-2 font-mono text-[10px]"
        >
          20260524T112308Z
        </Badge>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.1fr)] overflow-hidden max-lg:grid-cols-1">
        <div className="flex min-h-0 flex-col border-r max-lg:border-r-0 max-lg:border-b">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-4 py-2.5">
            <IconUpload
              size={15}
              className="text-muted-foreground"
              stroke={1.5}
            />
            <span className="text-sm font-medium">Image</span>
            <Button
              size="sm"
              disabled={!file || loading}
              onClick={submit}
              className="ml-auto h-7 gap-1.5 px-3 text-[11px]"
            >
              {loading ? (
                <IconLoader2 size={11} className="animate-spin" />
              ) : (
                <IconBrain size={11} />
              )}
              {loading ? "Predicting" : "Predict"}
            </Button>
          </div>

          <label className="m-4 flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/10 transition-colors hover:bg-muted/20">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setPrediction(null)
                setError(null)
              }}
            />
            {previewUrl ? (
              <div className="relative h-full w-full">
                <Image
                  src={previewUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <IconPhotoScan
                  size={28}
                  className="text-muted-foreground"
                  stroke={1.5}
                />
                <span className="text-sm font-medium">
                  Select baggage photo
                </span>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG, WebP, or BMP
                </span>
              </div>
            )}
          </label>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-muted/20 px-4">
            <IconBrain
              size={15}
              className="text-muted-foreground"
              stroke={1.5}
            />
            <span className="text-sm font-medium">Prediction</span>
            {prediction ? (
              <Badge className="ml-auto rounded px-2 font-mono text-[10px]">
                {topScore}
              </Badge>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {error ? (
              <pre className="whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs text-destructive">
                {error}
              </pre>
            ) : null}

            {prediction ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-background p-4">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    Top label
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {prediction.label}
                  </div>
                  <div className="mt-1 font-mono text-sm text-muted-foreground">
                    {topScore}
                  </div>
                </div>

                <div className="rounded-md border bg-background">
                  <div className="border-b px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    Rankings
                  </div>
                  <div className="divide-y">
                    {prediction.rankings.map((item) => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-3 px-3 py-2"
                      >
                        <span className="truncate text-sm">{item.label}</span>
                        <span className="text-right font-mono text-xs text-muted-foreground">
                          {Math.round(item.score * 1000) / 10}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border bg-background p-3">
                  <div className="grid gap-2 text-xs">
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-muted-foreground">Model</span>
                      <span className="truncate font-mono">
                        {prediction.model_uri}
                      </span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-muted-foreground">CLIP</span>
                      <span className="truncate font-mono">
                        {prediction.metadata.clip_model_id}
                      </span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-muted-foreground">Samples</span>
                      <span className="font-mono">
                        {prediction.metadata.training_samples ?? "n/a"}
                      </span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-muted-foreground">
                        Train accuracy
                      </span>
                      <span className="font-mono">
                        {prediction.metadata.train_accuracy ?? "n/a"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : !error ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No prediction yet
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
