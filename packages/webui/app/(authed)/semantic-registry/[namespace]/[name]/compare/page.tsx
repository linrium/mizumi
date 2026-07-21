"use client"

import { IconArrowLeft, IconGitCompare } from "@tabler/icons-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  compareSemanticVersions,
  type SemanticCompareResponse,
  type SemanticDefinitionDetail,
} from "@/services/semantic-registry"

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function VersionPanel({
  title,
  detail,
}: {
  title: string
  detail: SemanticDefinitionDetail
}) {
  const definition = detail.definition
  return (
    <section className="min-w-0 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-sm font-semibold">{title}</h2>
          <Badge variant="outline">{definition.status}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Owner {definition.owner_principal}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Spec</h3>
        <JsonBlock value={definition.spec} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Semantic dependencies
        </h3>
        <div className="rounded-md border">
          {detail.dependencies.length > 0 ? (
            detail.dependencies.map((item) => (
              <div
                key={item.id}
                className="border-b px-3 py-2 text-sm last:border-b-0"
              >
                <span className="font-mono">
                  {item.namespace}.{item.name}@v{item.version}
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No semantic dependencies
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Physical dependencies
        </h3>
        <div className="rounded-md border">
          {detail.physical_dependencies.length > 0 ? (
            detail.physical_dependencies.map((item) => (
              <div
                key={item.id}
                className="border-b px-3 py-2 text-sm last:border-b-0"
              >
                <span className="font-mono">
                  {item.catalog}.{item.schema_name}.{item.object_name}
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No physical dependencies
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default function SemanticComparePage() {
  const params = useParams<{ namespace: string; name: string }>()
  const namespace = decodeURIComponent(params.namespace)
  const name = decodeURIComponent(params.name)
  const [from] = useState(() => {
    if (typeof window === "undefined") return 1
    return Number(new URLSearchParams(window.location.search).get("from") ?? 1)
  })
  const [to] = useState(() => {
    if (typeof window === "undefined") return 1
    return Number(new URLSearchParams(window.location.search).get("to") ?? 1)
  })
  const [compare, setCompare] = useState<SemanticCompareResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await compareSemanticVersions(namespace, name, from, to)
        if (!cancelled) setCompare(data)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to compare versions"
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [namespace, name, from, to])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading comparison...
      </div>
    )
  }

  if (error || !compare) {
    return (
      <div className="p-4">
        <Button variant="ghost" asChild>
          <Link href={`/semantic-registry/${namespace}/${name}`}>
            <IconArrowLeft size={14} />
            Definition
          </Link>
        </Button>
        <p className="mt-4 text-sm text-destructive">
          {error ?? "Comparison not found"}
        </p>
      </div>
    )
  }

  const changed = Object.entries(compare.changes).filter(([, value]) => value)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <Button variant="ghost" size="default" asChild>
            <Link
              href={`/semantic-registry/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}?version=${to}`}
            >
              <IconArrowLeft size={14} />
              Definition
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconGitCompare size={16} className="text-muted-foreground" />
              <h1 className="font-mono text-sm font-semibold">
                {namespace}.{name}
              </h1>
              <Badge variant="outline">
                v{from} → v{to}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compare definition, dependency, physical reference, and lifecycle
              changes.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-3 pb-2.5">
          {changed.length > 0 ? (
            changed.map(([key]) => (
              <Badge key={key} variant="secondary">
                {key.replaceAll("_", " ")}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">No tracked differences</Badge>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <VersionPanel title={`v${from}`} detail={compare.from} />
          <VersionPanel title={`v${to}`} detail={compare.to} />
        </div>
        <Separator className="my-4" />
        <div>
          <h2 className="mb-2 text-sm font-semibold">Change flags</h2>
          <JsonBlock value={compare.changes} />
        </div>
      </div>
    </div>
  )
}
